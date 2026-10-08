//! Rust Sidecar (pass 168) — the srv half of the hybrid polyglot bridge.
//!
//! The vant side (lib/sidecar.js) builds this crate once (`cargo build
//! --release`), spawns the BINARY with the auth token as ARGV[1], reads
//! "SIDECAR_PORT=<n>" from stdout, then POSTs evals. One process, one
//! spawn cost, many calls — the same amortization julia-srv.jl gives the
//! JIT-heavy path, here applied to a compiled language.
//!
//! Wire (identical contract to julia-srv.jl, all JSON, token-checked):
//!   GET  /health  -> {"ok":true,"lang":"rust"}
//!   POST /eval    {"token","code"} -> {"ok":true,"stdout","stderr"}
//!   POST /stop    {"token"}        -> process exits 0
//!
//! Eval semantics: `code` is compiled as a snippet body inside
//! `fn main()` (bare statements, Rust-flavored println!). A snippet is
//! wrapped verbatim; the caller supplies complete valid Rust statements.
//! Each eval compiles to a temp crate and runs the binary — compilation
//! is the eval cost for an AOT language; the sidecar amortizes process
//! supervision, token exchange, and cargo project scaffolding, and makes
//! repeated evals a few hundred ms instead of a full toolchain dance.
//!
//! Loopback-only by default; the token gates every request. Stdlib only
//! (std::net + hand-rolled minimal HTTP) — zero crate dependencies, no
//! network beyond 127.0.0.1. Designed for the vant sidecar contract.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};

fn main() {
    let host = std::env::var("VANT_SIDECAR_HOST").unwrap_or_else(|_| "127.0.0.1".into());
    let listener = match TcpListener::bind((host.as_str(), 0)) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("bind failed: {}", e);
            std::process::exit(1);
        }
    };
    let port = listener
        .local_addr()
        .map(|a| a.port())
        .unwrap_or(0);
    println!("SIDECAR_PORT={}", port);
    let _ = std::io::stdout().flush();

    for stream in listener.incoming() {
        match stream {
            Ok(sock) => {
                std::thread::spawn(move || {
                    let _ = handle(sock);
                });
            }
            Err(_) => continue, // never let one bad accept kill the sidecar
        }
    }
}

// ---------------------------------------------------------------------------
// Eval: compile snippet in a temp crate, run it, capture stdout/stderr.
// ---------------------------------------------------------------------------

static EVAL_COUNTER: AtomicU64 = AtomicU64::new(0);

fn temp_root() -> std::path::PathBuf {
    std::env::var_os("VANT_SIDECAR_TMP")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
}

fn eval_snippet(code: &str) -> (bool, String, String) {
    let n = EVAL_COUNTER.fetch_add(1, Ordering::SeqCst);
    let dir = temp_root().join(format!("vant-rust-eval-{}-{}", std::process::id(), n));
    let src_dir = dir.join("src");
    if std::fs::create_dir_all(&src_dir).is_err() {
        return (false, String::new(), "failed to create eval temp dir".into());
    }

    let manifest = format!(
        "[package]\nname = \"vant-eval-{}\"\nversion = \"0.1.0\"\nedition = \"2021\"\n\n[[bin]]\nname = \"main\"\npath = \"main.rs\"\n\n[profile.dev]\nopt-level = 0\n",
        n
    );
    if std::fs::write(dir.join("Cargo.toml"), manifest).is_err() {
        return (false, String::new(), "failed to write Cargo.toml".into());
    }

    let main_rs = format!("fn main() {{\n{}\n}}\n", code);
    if std::fs::write(src_dir.join("main.rs"), main_rs).is_err() {
        return (false, String::new(), "failed to write main.rs".into());
    }

    // Compile. rustc directly (no cargo) — one file, no registry, no lockfile.
    let out = Command::new("rustc")
        .arg("--edition")
        .arg("2021")
        .arg("-O")
        .arg("-o")
        .arg(dir.join("eval-bin"))
        .arg(src_dir.join("main.rs"))
        .output();
    let out = match out {
        Ok(o) => o,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&dir);
            return (false, String::new(), format!("rustc spawn failed: {}", e));
        }
    };
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let _ = std::fs::remove_dir_all(&dir);
        return (false, String::new(), stderr);
    }

    // Run the compiled snippet with cwd = temp dir (snippet files land there).
    let run = Command::new(dir.join("eval-bin"))
        .current_dir(&dir)
        .output();
    let run = match run {
        Ok(o) => o,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&dir);
            return (false, String::new(), format!("eval spawn failed: {}", e));
        }
    };
    let stdout = String::from_utf8_lossy(&run.stdout).to_string();
    let stderr = String::from_utf8_lossy(&run.stderr).to_string();
    let _ = std::fs::remove_dir_all(&dir);
    (run.status.success(), stdout, stderr)
}

// ---------------------------------------------------------------------------
// Minimal HTTP (same hand-rolled shape as julia-srv.jl)
// ---------------------------------------------------------------------------

fn json_escape(s: &str) -> String {
    let mut buf = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        match c {
            '"' => buf.push_str("\\\""),
            '\\' => buf.push_str("\\\\"),
            '\n' => buf.push_str("\\n"),
            '\r' => buf.push_str("\\r"),
            '\t' => buf.push_str("\\t"),
            c if (c as u32) < 0x20 => buf.push_str(&format!("\\u{:04x}", c as u32)),
            c => buf.push(c),
        }
    }
    buf
}

fn respond(sock: &mut TcpStream, status: u16, body: &str) {
    let reason = if status == 200 { "OK" } else { "METHOD NOT ALLOWED" };
    let head = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        status,
        reason,
        body.len()
    );
    let _ = sock.write_all(head.as_bytes());
    let _ = sock.write_all(body.as_bytes());
}

/// Extract a JSON string field's value with escape awareness (mirrors
/// julia-srv.jl's scanner; naive single-pass regexes lose on nested quotes).
fn extract_string_field(body: &str, field: &str) -> Option<String> {
    let key = format!("\"{}\":\"", field);
    let start = body.find(&key)? + key.len();
    let mut out = String::new();
    let mut chars = body[start..].chars();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                if let Some(nxt) = chars.next() {
                    match nxt {
                        'n' => out.push('\n'),
                        't' => out.push('\t'),
                        'r' => out.push('\r'),
                        other => out.push(other),
                    }
                }
            }
            '"' => return Some(out),
            c => out.push(c),
        }
    }
    None
}

struct Request {
    method: String,
    path: String,
    body: String,
}

fn read_request(sock: &mut TcpStream) -> Option<Request> {
    let mut buf = [0u8; 8192];
    let mut raw = Vec::new();
    // Read until we have headers (blank line) — then read body by length.
    let header_end;
    loop {
        let n = sock.read(&mut buf).ok()?;
        if n == 0 {
            return None;
        }
        raw.extend_from_slice(&buf[..n]);
        if let Some(pos) = find_subslice(&raw, b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
        if raw.len() > 64 * 1024 {
            return None;
        }
    }
    let text = String::from_utf8_lossy(&raw[..header_end]).to_string();
    let mut lines = text.lines();
    let first = lines.next()?;
    let mut parts = first.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();

    let mut content_length = 0usize;
    for line in lines {
        let lower = line.to_lowercase();
        if let Some(v) = lower.strip_prefix("content-length:") {
            content_length = v.trim().parse().unwrap_or(0);
        }
    }

    let mut body = String::from_utf8_lossy(&raw[header_end..]).to_string();
    while body.len() < content_length {
        let n = sock.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        body.push_str(&String::from_utf8_lossy(&buf[..n]));
    }
    body.truncate(content_length);

    Some(Request { method, path, body })
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

fn token_matches(body: &str, expected: &str) -> bool {
    match extract_string_field(body, "token") {
        Some(t) => !expected.is_empty() && &t == expected,
        None => false,
    }
}

fn argv_token() -> String {
    std::env::args().nth(1).unwrap_or_default()
}

fn handle(mut sock: TcpStream) -> Result<(), std::io::Error> {
    let req = match read_request(&mut sock) {
        Some(r) => r,
        None => return Ok(()),
    };

    if req.method == "GET" && req.path.starts_with("/health") {
        respond(&mut sock, 200, "{\"ok\":true,\"lang\":\"rust\"}");
        return Ok(());
    }

    if req.method == "POST" && (req.path.starts_with("/eval") || req.path.starts_with("/stop")) {
        // Token check (argv token, escape-aware extraction — same contract
        // as julia-srv: wrong/missing token is a 405 with ok:false).
        let expected = argv_token();
        if !token_matches(&req.body, &expected) {
            respond(&mut sock, 405, "{\"ok\":false,\"stderr\":\"bad token\"}");
            return Ok(());
        }
        if req.path.starts_with("/stop") {
            respond(&mut sock, 200, "{\"ok\":true}");
            let _ = sock.flush();
            std::process::exit(0);
        }
        let code = match extract_string_field(&req.body, "code") {
            Some(c) => c,
            None => {
                respond(&mut sock, 200, "{\"ok\":false,\"stderr\":\"missing code\"}");
                return Ok(());
            }
        };
        let (ok, stdout, stderr) = eval_snippet(&code);
        let payload = format!(
            "{{\"ok\":{},\"stdout\":\"{}\",\"stderr\":\"{}\"}}",
            ok,
            json_escape(&stdout),
            json_escape(&stderr)
        );
        respond(&mut sock, 200, &payload);
        return Ok(());
    }

    respond(&mut sock, 405, "{}");
    Ok(())
}

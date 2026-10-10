#=
Julia Sidecar (pass 166) — the srv half of the hybrid polyglot bridge.

The vant side (lib/sidecar.js) spawns this with the auth token as
ARGV[1], reads "SIDECAR_PORT=<n>" from stdout, then POSTs evals. One
process, one JIT cost, many calls — geometry/engine.js-style
per-operation math stops paying 2-30s of JIT per multiply.

Wire (all JSON, token-checked):
  GET  /health  -> {"ok":true,"lang":"julia"}
  POST /eval    {"token","code"} -> {"ok":true,"stdout","stderr"}
  POST /stop    {"token"}        -> process exits 0

Loopback-only by default; the token gates every request. Uses only
stdlib (Sockets for TCP + hand-rolled minimal HTTP) so no deps beyond
a Julia install. Designed for the vant sidecar contract — do not
expose beyond 127.0.0.1.
=#

using Sockets

const TOKEN = length(ARGS) >= 1 ? ARGS[1] : ""
const HOST = get(ENV, "VANT_SIDECAR_HOST", "127.0.0.1")

json_escape(s::AbstractString) = begin
    buf = IOBuffer()
    for c in s
        if c == '"'  || c == '\\'
            print(buf, '\\', c)
        elseif c == '\n'
            print(buf, "\\n")
        elseif c == '\r'
            print(buf, "\\r")
        elseif c == '\t'
            print(buf, "\\t")
        else
            print(buf, c)
        end
    end
    String(take!(buf))
end

function respond(sock, status::Int, body::AbstractString)
    reason = status == 200 ? "OK" : "METHOD NOT ALLOWED"
    write(sock, "HTTP/1.1 $status $reason\r\n" *
        "Content-Type: application/json\r\n" *
        "Content-Length: $(sizeof(body))\r\n" *
        "Connection: close\r\n\r\n$body")
end

#= (pin-caught, live smoke) regex-extracting nested JSON strings is fragile
(escaped quotes inside code defeat single-pass patterns). This scanner
walks the value char-by-char with escape awareness and unescapes as it
goes. Returns nothing when the field is absent. =#
function extract_string_field(body::AbstractString, field::AbstractString)
    key = "\"" * field * "\":\""
    i = findfirst(key, body)
    i === nothing && return nothing
    j = i[end] + 1
    buf = IOBuffer()
    while j <= length(body)
        c = body[j]
        if c == '\\' && j < length(body)
            nxt = body[j+1]
            print(buf, nxt == 'n' ? '\n' : nxt == 't' ? '\t' : nxt == 'r' ? '\r' : nxt)
            j += 2
        elseif c == '"'
            return String(take!(buf))
        else
            print(buf, c)
            j += 1
        end
    end
    return nothing
end

function handle(sock)
    req = ""
    # minimal HTTP read: request line + headers (until blank line)
    while true
        line = readline(sock)
        isempty(strip(line)) && break
        req *= line * "\n"
    end
    firstline = split(req, "\n")[1]
    parts = split(firstline, " ")
    length(parts) < 2 && (respond(sock, 405, "{}"); return)
    method, path = parts[1], parts[2]

    # (pin-caught, live smoke) the client holds its write side open until the
    # response arrives — read the body by Content-Length, never to EOF.
    clen = 0
    for line in split(req, "\n")
        m = match(r"(?i)content-length:\s*(\d+)", line)
        m !== nothing && (clen = parse(Int, m.captures[1]); break)
    end

    if method == "GET" && startswith(path, "/health")
        respond(sock, 200, "{\"ok\":true,\"lang\":\"julia\"}")
        return
    end

    if method == "POST" && (startswith(path, "/eval") || startswith(path, "/stop"))
        raw = clen > 0 ? String(read(sock, clen)) : ""
        body = occursin("{\"token\"", raw) ? raw[findfirst("{\"token\"", raw)[1]:end] : "{}"
        tok = extract_string_field(body, "token")
        if tok === nothing || tok != TOKEN
            respond(sock, 405, "{\"ok\":false,\"stderr\":\"bad token\"}")
            return
        end
        if startswith(path, "/stop")
            respond(sock, 200, "{\"ok\":true}")
            close(sock)
            exit(0)
        end
        code = extract_string_field(body, "code")
        if code === nothing
            respond(sock, 200, "{\"ok\":false,\"stderr\":\"missing code\"}")
            return
        end
        src = code
        # Capture stdout/stderr via the documented zero-arg redirect idiom:
        # rd, wr = redirect_stdout() swaps global stdout to wr and returns the
        # reader. Restore in finally; close write ends so readers see EOF.
        orig_out = stdout
        orig_err = stderr
        out_r, out_w = redirect_stdout()
        err_r, err_w = redirect_stderr()
        ok = true
        try
            include_string(Main, src)
        catch e
            ok = false
            println(err_w, sprint(showerror, e))
        finally
            close(out_w)
            close(err_w)
            redirect_stdout(orig_out)
            redirect_stderr(orig_err)
        end
        out = String(read(out_r, String))
        err = String(read(err_r, String))
        payload = "{\"ok\":$ok,\"stdout\":\"$(json_escape(out))\"," *
            "\"stderr\":\"$(json_escape(err))\"}"
        respond(sock, 200, payload)
        return
    end

    respond(sock, 405, "{}")
end

function main()
    server = listen(parse(IPAddr, HOST), 0)   # OS-assigned port
    port = getsockname(server)[2]
    println("SIDECAR_PORT=$port")
    flush(stdout)
    while true
        sock = accept(server)
        @async begin
            try
                handle(sock)
            catch e
                # never let one bad request kill the sidecar
            finally
                close(sock)
            end
        end
    end
end

isinteractive() || main()

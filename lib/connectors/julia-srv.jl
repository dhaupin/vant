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

function handle(sock)
    req = ""
    # minimal HTTP read: request line + headers + optional body
    while true
        line = readline(sock)
        isempty(line) && break
        req *= line * "\n"
    end
    firstline = split(req, "\n")[1]
    parts = split(firstline, " ")
    length(parts) < 2 && (respond(sock, 405, "{}"); return)
    method, path = parts[1], parts[2]

    if method == "GET" && startswith(path, "/health")
        respond(sock, 200, "{\"ok\":true,\"lang\":\"julia\"}")
        return
    end

    if method == "POST" && (startswith(path, "/eval") || startswith(path, "/stop"))
        # NOTE: minimal parse — read remaining bytes as body (Content-Length
        # respected by the client closing; vant's client always sends JSON).
        raw = String(read(sock, String))
        body = occursin("{\"token\"", raw) ? raw[findfirst("{\"token\"", raw)[1]:end] : "{}"
        tok = match(r'"token"\s*:\s*"([^"]*)"', body)
        if tok === nothing || tok.captures[1] != TOKEN
            respond(sock, 405, "{\"ok\":false,\"stderr\":\"bad token\"}")
            return
        end
        if startswith(path, "/stop")
            respond(sock, 200, "{\"ok\":true}")
            close(sock)
            exit(0)
        end
        code = match(r'"code"\s*:\s*"((?:[^"\\]|\\.)*)"', body)
        if code === nothing
            respond(sock, 200, "{\"ok\":false,\"stderr\":\"missing code\"}")
            return
        end
        # unescape the JSON string back to raw code
        src = replace(code.captures[1], "\\n" => "\n", "\\t" => "\t",
            "\\r" => "\r", "\\\"" => "\"", "\\\\" => "\\")
        out = IOBuffer(); err = IOBuffer()
        ok = true
        try
            redirect(stdout, out) do
                redirect(stderr, err) do
                    include_string(Main, src)
                end
            end
        catch e
            ok = false
            println(err, sprint(showerror, e))
        end
        payload = "{\"ok\":$ok,\"stdout\":\"$(json_escape(String(take!(out))))\"," *
            "\"stderr\":\"$(json_escape(String(take!(err))))\"}"
        respond(sock, 200, payload)
        return
    end

    respond(sock, 405, "{}")
end

function main()
    server = listen(HOST, 0)   # OS-assigned port
    port = getport(server)
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

getport(server) = parse(Int, split(string(server.status), ":")[end])

isinteractive() || main()

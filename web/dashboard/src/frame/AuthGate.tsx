import { useState } from "react";
import { actions, useApp } from "../state";
import { Help } from "./Tooltip";

/**
 * Login gate (prd-web.md 3.5, MVP): the operator pastes a vguest_ token
 * per load. It lives in MEMORY ONLY - never in localStorage - and the
 * Worker forwards it without logging. The email-OTP account flow is the
 * P2 replacement; this gate remains the fallback for local installs.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  if (token === null) {
    return <Login />;
  }
  return children;
}

function Login() {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const property = useApp((s) => s.property);

  const submit = (e: React.FormEvent) => {
    const eHandler = e;
    eHandler.preventDefault();
    const token = value.trim();
    if (!token.startsWith("vguest_")) {
      setErr("That is not a guest token. It starts with vguest_.");
      return;
    }
    setErr(null);
    actions.setToken(property, token);
  };

  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <img
            alt=""
            className="size-7 inline-block"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='13' r='10' fill='%23a9701e'/%3E%3Crect x='12' y='22' width='8' height='8' rx='3' fill='%23b89a5a'/%3E%3C/svg%3E"
          />
          Bolete
        </h1>
        <p className="mt-1 text-sm text-ink-soft">the Vant dashboard</p>
        <div className="mt-6 rounded-lg border border-line bg-surface p-4">
          <p className="text-sm font-medium">Show your identity</p>
          <p className="mt-1 text-xs text-ink-soft">
            Paste the guest token for this pod. It stays in memory and is
            forwarded via the bridge, but never stored and never logged.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-3">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="vguest_..."
              className="w-full rounded-md border border-line bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-accent"
            />
            {err ? <p className="text-xs text-err">{err}</p> : null}
            <Help text="Tokens are issued with `vant guest issue` on the pod. Roles ride the sandbox capability vocabulary.">
              <span className="text-xs text-ink-soft">Where do tokens come from?</span>
            </Help>
            <button
              type="submit"
              className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-paper hover:bg-accent-deep"
            >
              Enter
            </button>
          </form>
          <p className="mt-4 text-[11px] text-ink-soft">
            Email-code sign-in lands at P2; this paste gate stays the
            fallback for installs without email. See prd-web.md 3.5.
          </p>
        </div>
      </div>
    </div>
  );
}

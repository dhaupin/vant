import { useEffect, useRef, useState } from "react";
import { actions, useApp, type DashRole } from "../state";
import { Help } from "./Tooltip";

/**
 * Login gate (prd-web.md 3.5, P2): email + one-time code is the
 * PRIMARY flow now; the vguest_ paste stays as the honestly-labeled
 * fallback for local installs without email/store config. The session
 * itself is server-side (`bsess_` HttpOnly cookie) - the browser never
 * holds the pod token or the email. On load we PROBE /api/auth/session
 * so a live session is restored without flashing the login screen.
 */

export function AuthGate({ children }: { children: React.ReactNode }) {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const account = useApp((s) => s.account);
  const [probeState, setProbeState] = useState<"probing" | "done">("probing");

  // Restore a live server-side session before rendering anything.
  // First: rehydrate THIS TAB's pasted token from sessionStorage (a full
  // page load used to drop the in-memory token and flash the login gate —
  // live-caught on the preview). One-shot, not part of the probe loop.
  useEffect(() => {
    actions.restoreToken(getProperty());
    // (P6b gap fix) the pairwise-bound e2e channel key shares the token's
    // one-tab scope: rehydrate it alongside the token or a reload would
    // silently downgrade every door call to the direct bridge with a key
    // sitting unrestored in sessionStorage.
    actions.restoreChannelKey(getProperty());
    // (pass 274, §2.2 storage rung) then the DEVICE PROFILE: the sovereign
    // profile sealed in IndexedDB under the non-extractable device key
    // survives tab resets — possession IS the unlock, so this runs on
    // every mount and binds only what this tab is missing.
    void actions.restoreDeviceProfile();
  }, []);

  useEffect(() => {
    if (token || account) {
      setProbeState("done");
      return;
    }
    let alive = true;
    fetch(`/api/auth/session?p=${encodeURIComponent(getProperty())}`)
      .then(async (res) => {
        if (!alive) return;
        if (res.ok) {
          const data = (await res.json()) as { role?: string; bound?: boolean };
          const role: DashRole = data.role === "admin" ? "admin" : "viewer";
          actions.setAccount({ role }, data.bound ? [getProperty()] : []);
        }
      })
      .catch(() => undefined) // undeployed functions: the login screen is honest
      .finally(() => {
        if (alive) setProbeState("done");
      });
    return () => {
      alive = false;
    };
  }, [token, account]);

  if (token === null && account === null) {
    if (probeState === "probing") {
      return (
        <GateShell>
          <p className="text-sm text-ink-soft">Checking for a live session...</p>
        </GateShell>
      );
    }
    return <Login />;
  }
  return children;
}

function getProperty(): string {
  try {
    return new URLSearchParams(window.location.search).get("p") ?? "local";
  } catch {
    return "local";
  }
}

type Step =
  | { s: "email" }
  | { s: "sent"; email: string; resendIn: number };

function Login() {
  const [step, setStep] = useState<Step>({ s: "email" });
  const [mode, setMode] = useState<"email" | "token">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const resendTimer = useRef<number | null>(null);

  useEffect(() => {
    if (step.s !== "sent") return;
    const interval = window.setInterval(() => {
      setStep((current) =>
        current.s === "sent" && current.resendIn > 0
          ? { ...current, resendIn: current.resendIn - 1 }
          : current,
      );
    }, 1000);
    resendTimer.current = interval;
    return () => window.clearInterval(interval);
  }, [step.s]);

  const request = async () => {
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setErr("That is not an email address shape.");
      return;
    }
    setErr(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (res.ok) {
        setStep({ s: "sent", email: clean, resendIn: 60 });
      } else if (data.error === "E_EMAIL_UNCONFIGURED" || data.error === "E_STORE_UNCONFIGURED") {
        setErr("Email sign-in is not configured on this deployment yet - use the paste-token fallback.");
        setMode("token");
      } else if (data.error === "E_OTP_COOLDOWN") {
        setErr("A code was requested for that address recently. Wait a minute.");
      } else {
        setErr(data.detail ?? "the request was refused");
      }
    } catch {
      setErr("Functions not reachable (undeployed or offline).");
    }
  };

  const verify = async () => {
    if (step.s !== "sent") return;
    setErr(null);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: step.email, code: code.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        role?: string;
        error?: string;
        detail?: string;
      };
      if (res.ok && data.ok) {
        const role: DashRole = data.role === "admin" ? "admin" : "viewer";
        actions.setAccount({ role }, []);
        return;
      }
      const shaped =
        data.error === "E_OTP_MISMATCH"
          ? "That code is not right. Attempts are budgeted."
          : data.error === "E_OTP_BURNED"
            ? "Too many wrong attempts; the code was burned. Request a fresh one."
            : data.error === "E_OTP_EXPIRED"
              ? "No live code for that address. Request one."
              : (data.detail ?? "the door said no");
      setErr(shaped);
      if (data.error === "E_OTP_BURNED" || data.error === "E_OTP_EXPIRED") setStep({ s: "email" });
    } catch {
      setErr("Functions not reachable (undeployed or offline).");
    }
  };

  return <GateShell>{mode === "email" ? <EmailMode /> : <TokenMode />}</GateShell>;

  function EmailMode() {
    const sent = step.s === "sent";
    return (
      <div className="mt-6 rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-medium">Sign in with a one-time code</p>
        {!sent ? (
          <>
            <p className="mt-1 text-xs text-ink-soft">
              Enter your dashboard email; a single-use code arrives by
              mail. The email is stored hashed server-side.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void request();
              }}
              className="mt-4 space-y-3"
            >
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@example.com"
                className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-paper hover:bg-accent-deep"
              >
                Send code
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-soft">
              A code was sent to <span className="font-mono">{step.email}</span>.
              It expires in 10 minutes and works once.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
              className="mt-4 space-y-3"
            >
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full rounded-md border border-line bg-paper px-3 py-2 text-center font-mono text-lg tracking-widest outline-none focus:border-accent"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-paper hover:bg-accent-deep"
              >
                Verify
              </button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  disabled={step.resendIn > 0}
                  onClick={() => void request()}
                  className="text-ink-soft hover:text-ink disabled:opacity-50"
                >
                  Resend{step.resendIn > 0 ? ` (wait ${step.resendIn}s)` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => setStep({ s: "email" })}
                  className="text-ink-soft hover:text-ink"
                >
                  use another email
                </button>
              </div>
            </form>
          </>
        )}
        {err ? <p className="mt-3 text-xs text-err">{err}</p> : null}
        <button
          type="button"
          onClick={() => setMode("token")}
          className="mt-4 text-xs text-ink-soft underline hover:text-ink"
        >
          Paste a vguest_ token instead
        </button>
      </div>
    );
  }

  function TokenMode() {
    const [value, setValue] = useState("");
    const property = useApp((s) => s.property);
    const account = useApp((s) => s.account);
    const [note, setNote] = useState<string | null>(null);

    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      const pasted = value.trim();
      if (!pasted.startsWith("vguest_")) {
        setErr("That is not a guest token. It starts with vguest_.");
        return;
      }
      setErr(null);
      if (account) {
        // live account session: bind the pod token SERVER-SIDE; the
        // browser never holds it (prd-web.md 3.5 session binding)
        try {
          const res = await fetch(`/api/session?p=${encodeURIComponent(property)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: pasted }),
          });
          const data = (await res.json().catch(() => ({}))) as { bound?: boolean };
          if (res.ok && data.bound) {
            actions.markBound(property);
            setNote("Bound server-side to this session.");
            setValue("");
            return;
          }
          setNote("Functions refused the bind - falling back to memory.");
        } catch {
          setNote("Functions not reachable - keeping the token memory-only.");
        }
      }
      actions.setToken(property, pasted);
    };

    return (
      <div className="mt-6 rounded-lg border border-line bg-surface p-4">
        <p className="text-sm font-medium">Show your identity (fallback)</p>
        <p className="mt-1 text-xs text-ink-soft">
          Paste the guest token for this pod. With a live account session
          it binds SERVER-SIDE; without one it stays in memory for this
          load, never stored and never logged.
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
          <button
            type="submit"
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-paper hover:bg-accent-deep"
          >
            Enter
          </button>
        </form>
        <Help text="Tokens are issued with `vant guest issue` on the pod. Roles ride the sandbox capability vocabulary.">
          <span className="mt-2 inline-block text-xs text-ink-soft">Where do tokens come from?</span>
        </Help>
        {note ? <p className="mt-3 text-xs text-ink-soft">{note}</p> : null}
        {err ? <p className="mt-3 text-xs text-err">{err}</p> : null}
        <button
          type="button"
          onClick={() => setMode("email")}
          className="mt-3 block text-xs text-ink-soft underline hover:text-ink"
        >
          Use email code sign-in
        </button>
      </div>
    );
  }
}

function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-xl">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <img
            alt=""
            className="size-7 inline-block"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='13' r='10' fill='%23a9701e'/%3E%3Crect x='12' y='22' width='8' height='8' rx='3' fill='%23b89a5a'/%3E%3C/svg%3E"
          />
          Bolete
        </h1>
        <p className="mt-1 text-sm text-ink-soft">the Vant dashboard</p>
        {/* Logged-out landing: people hit this cold. Say what they are
            looking at, what they will see once they are in, and where the
            seat comes from - then the sign-in card. */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-semibold">Sessions, live</p>
            <p className="mt-1 text-xs text-ink-soft">
              Agent work as it happens: tool calls, budgets, refusals.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-semibold">Crews and carriers</p>
            <p className="mt-1 text-xs text-ink-soft">
              Rosters, brains, and sealed packets in flight between pods.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="text-xs font-semibold">Ledgers with doors on them</p>
            <p className="mt-1 text-xs text-ink-soft">
              Audit trails and forum verdicts, scoped by your guest role.
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          A seat comes from a running Vant pod: the operator issues a
          <code className="mx-1 rounded border border-line bg-paper px-1 font-mono">vguest_</code>
          token with <code className="font-mono">vant guest issue</code>, and the dashboard reads that pod over the
          gated dashboard bridge. New to Vant? Start at the{" "}
          <a
            href="https://vant.creadev.org"
            rel="noopener"
            target="_blank"
            className="underline hover:text-ink"
          >
            Vant home page
          </a>{" "}
          or open the{" "}
          <a
            href="https://docs.creadev.org/vant"
            rel="noopener"
            target="_blank"
            className="underline hover:text-ink"
          >
            docs
          </a>.
        </p>
        <div className="mx-auto mt-6 w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}

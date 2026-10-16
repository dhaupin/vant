import { useEffect, useMemo, useState } from "react";
import { exec, ApiError } from "../../api";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { useApp } from "../../state";

/**
 * Module: pairing (catalog #14, Tier S) — P3 rung two (H6 un-holds here).
 * The door REALLY registers (added pass/#axolotl 2026-10-16, live-probed):
 *   pairing_voucher_generate {} -> { ok, code, shownOnce, expiresInHours }
 *     — admin-only; the code is random, shown ONCE; the guest ledger keeps
 *     only its SHA-256 hash (the token-in-ledger precedent).
 *   pairing_voucher_redeem { code } -> { ok, token, guest } or
 *     { ok:false, reason } — single-use, timing-safe compare, 24h expiry.
 * The redeem view is the deep-link target: /pairing?code=vhpair-…
 * redeeming a scanned voucher lands EXACTLY here, typed refusal states
 * rendered verbatim (a guest seat answers the admin-only refusal for
 * generate — by design, never a fake mint).
 */

interface RedeemResult {
  ok?: boolean;
  code?: string;
  shownOnce?: boolean;
  expiresInHours?: number;
  token?: string;
  guest?: { id?: string; name?: string; role?: string };
  reason?: string;
  error?: string;
}

function deepLink(code: string): string {
  const u = new URL(window.location.href);
  u.pathname = "/pairing";
  u.search = `?code=${encodeURIComponent(code)}`;
  return u.toString();
}

/** Dependency-free QR: renders the deep link as a scannable matrix using
 *  the "visual grid" fallback — an honest picture of the link, NOT a
 *  fake scannable barcode. Camera-scan lands via the URL, the grid is
 *  the human-readable companion (a real QR encoder is a dep decision
 *  parked for the P3 owner; the deep link already works). */
function CodeGrid({ link }: { link: string }) {
  const cells = useMemo(() => {
    const size = 21;
    let h = 2166136261;
    for (const ch of link) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619) >>> 0;
    }
    const out: boolean[] = [];
    for (let i = 0; i < size * size; i++) {
      h ^= i * 2654435761;
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      out.push(((h >>> 15) & 1) === 1);
    }
    // corner finder squares keep the grid STRONGLY visually distinct from
    // the data area (so nobody mistakes it for a scannable QR)
    const finder = (r: number, c: number) => {
      const inTopLeft = r < 5 && c < 5;
      const inTopRight = r < 5 && c >= size - 5;
      const inBottom = r >= size - 5 && c < 5;
      if (!(inTopLeft || inTopRight || inBottom)) return null;
      const rr = r % (r >= size - 5 ? size - 5 : 0) || (r >= size - 5 ? r - (size - 5) : r);
      const cc = c % (c >= size - 5 ? 0 : 5) || (c >= size - 5 ? c : c - (size - 5));
      const pr = inBottom ? rr : r;
      const pc = inTopRight ? c - (size - 5) : cc % 5;
      const edge = pr === 0 || pr === 4 || pc === 0 || pc === 4;
      const center = pr === 2 && pc === 2;
      return edge || center;
    };
    return out.map((v, i) => {
      const r = Math.floor(i / size), c = i % size;
      const f = finder(r, c);
      return f === null ? v : f;
    });
  }, [link]);

  return (
    <div
      className="inline-grid gap-px rounded-lg border border-line bg-surface p-2"
      style={{ gridTemplateColumns: `repeat(21, 8px)` }}
      aria-label="pairing deep link grid (not a scannable QR)"
    >
      {cells.map((on, i) => (
        <span key={i} className={on ? "h-2 w-2 bg-ink" : "h-2 w-2 bg-transparent"} />
      ))}
    </div>
  );
}

export default function Pairing() {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const toolsQ = useToolsQuery();
  const caps = toolsQ.isSuccess ? toolsByPrefix(toolsQ.data, "pairing_voucher_") : [];
  const hasGenerate = caps.some((c) => c.name === "pairing_voucher_generate");
  const hasRedeem = caps.some((c) => c.name === "pairing_voucher_redeem");

  // The redeem panel pre-fills from a deep link (?code=vhpair-…)
  const [linkedCode, setLinkedCode] = useState<string>("");
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const c = q.get("code");
      if (c && /^vhpair-[A-Za-z0-9-]{6,49}$/.test(c)) setLinkedCode(c);
    } catch { /* SSR-ish edge: honestly absent */ }
  }, []);

  if (toolsQ.isPending) {
    return <p className="text-sm text-ink-soft">Asking the door for its tool list...</p>;
  }

  return (
    <div>
      <h1 className="text-lg font-semibold">Pairing</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Pairing vouchers, end to end — mint (admin), scan-or-click redeem.
        The code is shown ONCE; the ledger keeps only its hash; redemption
        is single-use and 24-hour-limited into the default human guest.
      </p>

      {toolsQ.isError ? (
        (() => {
          const e = toolsQ.error as ApiError;
          return e.kind === "network"
            ? <NotConnected why="The bridge is unreachable, so the pairing surface cannot load." />
            : <p className="mt-4 text-sm text-err">{e.message}</p>;
        })()
      ) : null}

      {toolsQ.isSuccess && caps.length === 0 ? (
        <NotConnected
          why="The door answered but carries no pairing_voucher_ tools — this pod predates the pairing-on-door rung. The CLI flow (vant guest pair --code) still works and remains stated as what it is."
        />
      ) : null}

      {hasGenerate ? <IssuePanel admin={!token} /> : null}
      {hasRedeem ? <RedeemPanel prefill={linkedCode} /> : null}
    </div>
  );
}

/* ------------------------------------------------------ mint (admin) -- */

function IssuePanel({ admin }: { admin?: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState("");

  const mint = async () => {
    setBusy(true);
    setRefusal("");
    setCode(null);
    try {
      const r = (await exec("pairing_voucher_generate", {})) as unknown as RedeemResult;
      // The door wraps tool payloads in { result }.
      const v = (r && typeof r === "object" && "result" in r ? (r as { result: RedeemResult }).result : r);
      if (v?.ok && typeof v.code === "string") setCode(v.code);
      else setRefusal(v?.error ?? v?.reason ?? "the mint did not answer");
    } catch (err) {
      setRefusal(err instanceof ApiError ? err.message : "the door did not answer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">mint voucher (admin)</p>
      <button
        type="button"
        onClick={mint}
        disabled={busy}
        className="mt-2 rounded bg-accent px-3 py-1 text-sm text-paper hover:bg-accent-deep disabled:opacity-50"
      >
        {busy ? "minting…" : "Mint pairing voucher"}
      </button>
      {admin ? (
        <p className="mt-2 text-xs text-ink-soft">
          Heads-up: minting is admin-only at the door — a guest seat reading
          the typed refusal here is the honest answer, not a bug.
        </p>
      ) : null}
      {refusal ? (
        <p className="mt-2 rounded-md border border-err/40 bg-err/5 px-3 py-2 text-xs text-err">{refusal}</p>
      ) : null}
      {code ? (
        <div className="mt-3 rounded-md border border-accent/40 bg-accent/5 p-3">
          <p className="text-xs font-medium text-accent">
            Voucher — SHOWN ONCE. The ledger keeps only its SHA-256 hash.
            Copy or scan now; it dies after first redemption or 24h.
          </p>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded border border-line bg-paper p-2 font-mono text-xs">
            {code}
          </pre>
          <div className="mt-2 flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() => { void navigator.clipboard?.writeText(code); }}
              className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5"
            >
              Copy code
            </button>
            <a
              href={deepLink(code)}
              className="rounded border border-line px-2 py-1 text-xs hover:bg-ink/5"
            >
              Open redeem deep link
            </a>
            <CodeGrid link={deepLink(code)} />
            <button
              type="button"
              onClick={() => setCode(null)}
              className="row-span-full rounded border border-line px-2 py-1 text-xs hover:bg-ink/5"
            >
              I saved it — hide forever
            </button>
          </div>
          <p className="mt-2 text-[10px] text-ink-soft">
            The grid is the deep link's deterministic fingerprint (a human
            check), not a scannable QR — camera pairing rides the printed
            URL/label until a QR encoder dep is picked. Honest, stated.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- redeem -- */

function RedeemPanel({ prefill }: { prefill: string }) {
  const [code, setCode] = useState(prefill);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [refusal, setRefusal] = useState("");

  const redeem = async () => {
    const clean = code.trim();
    if (!clean || busy) return;
    setBusy(true);
    setRefusal("");
    setResult(null);
    try {
      const r = (await exec("pairing_voucher_redeem", { code: clean })) as unknown as RedeemResult;
      const v = (r && typeof r === "object" && "result" in r ? (r as { result: RedeemResult }).result : r);
      setResult(v ?? null);
    } catch (err) {
      setRefusal(err instanceof ApiError ? err.message : "the door did not answer");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">redeem voucher</p>
      <p className="mt-1 text-xs text-ink-soft">
        Paste or scan — the code itself is the credential. A redeeming phone
        lands here from the deep link <span className="font-mono">/pairing?code=…</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void redeem(); }}
          placeholder="vhpair-…"
          spellCheck={false}
          className="min-w-56 flex-1 rounded border border-line bg-paper px-2 py-1 font-mono text-xs outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={redeem}
          disabled={busy || !code.trim()}
          className="rounded bg-accent px-3 py-1 text-sm text-paper hover:bg-accent-deep disabled:opacity-50"
        >
          {busy ? "redeeming…" : "Redeem"}
        </button>
      </div>
      {refusal ? (
        <p className="mt-2 rounded-md border border-err/40 bg-err/5 px-3 py-2 text-xs text-err">{refusal}</p>
      ) : null}
      {result ? (
        result.ok && result.token ? (
          <div className="mt-3 rounded-md border border-moss/40 bg-moss/10 p-3">
            <p className="text-xs font-medium text-moss">
              Redeemed — token SHOWN ONCE. Paste it into settings for this
              property to become the human guest it just minted.
            </p>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded border border-line bg-paper p-2 font-mono text-xs">
              {result.token}
            </pre>
            <p className="mt-1 text-xs text-ink-soft">
              guest id: <span className="font-mono">{result.guest?.id ?? "?"}</span>
              {result.guest?.role ? ` · role ${result.guest.role}` : ""}
              {" · single-use: this code can never redeem again"}
            </p>
          </div>
        ) : (
          <p className="mt-3 rounded-md border border-err/40 bg-err/5 px-3 py-2 text-xs text-err">
            {result.reason ?? "the redeem was refused"}
          </p>
        )
      ) : null}
    </div>
  );
}

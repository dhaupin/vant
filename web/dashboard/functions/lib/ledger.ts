import type { KVStore } from "./kv";

/**
 * The frontend's OWN audit ledger (prd-web.md 10: "the app keeps a
 * capped function-side audit ledger of its own - auth events, refusals,
 * breaker states - and renders a typed-error inbox"). Honest properties:
 *   - the binding IS the cap: rows write with an explicit TTL, so the
 *     ledger ages out without a janitor (LRU-free, no drift)
 *   - names are zero-padded-timestamp-ordered so prefix listing reads
 *     newest-first with ONE scan
 *   - a ledger write failure NEVER fails the request it observes
 *     (best-effort by design; the typed refusal is the record)
 *   - NO PII: no emails, no tokens, no session ids - role + kind only
 *     (prd-web.md 3.5 hygiene extends to the ledger)
 */

export const LEDGER_TTL_SECONDS = 60 * 60 * 24 * 14; // two weeks, the app's own cap
export const LEDGER_PREFIX = "aud:";

export type LedgerKind =
  | "auth.otp.requested"
  | "auth.otp.cooldown"
  | "auth.otp.verified"
  | "auth.otp.failed"
  | "auth.otp.burned"
  | "auth.session.created"
  | "auth.session.destroyed"
  | "auth.account.disabled"
  | "auth.account.activated"
  | "bridge.refused"
  | "bridge.unreachable";

export interface LedgerEvent {
  at: number;
  kind: LedgerKind;
  /** free context WITHOUT PII: e.g. role, property id, HTTP status */
  detail: Record<string, string | number>;
}

export interface LedgerApi {
  append(kind: LedgerKind, detail?: Record<string, string | number>): Promise<boolean>;
  /** newest-first, capped (default 50). Rows that lost their JSON are
   *  skipped, not faked. */
  recent(limit?: number): Promise<LedgerEvent[]>;
}

export function makeLedger(store: KVStore): LedgerApi {
  async function append(kind: LedgerKind, detail: Record<string, string | number> = {}): Promise<boolean> {
    try {
      const at = Date.now();
      // zero-padded ms so lex order == newest first
      await store.put(`${LEDGER_PREFIX}${String(at).padStart(16, "0")}:${randomSuffix()}`, JSON.stringify({ at, kind, detail } satisfies LedgerEvent), {
        expirationTtl: LEDGER_TTL_SECONDS,
      });
      return true;
    } catch {
      return false; // the ledger never takes the host request down
    }
  }

  async function recent(limit = 50): Promise<LedgerEvent[]> {
    // shape-gate the names BEFORE capping: a malformed key (or foreign
    // row under the prefix) must never eat a cap slot or break lex order
    const names = (await store.list(LEDGER_PREFIX))
      .map((r) => r.name)
      .filter((n) => new RegExp(`^${LEDGER_PREFIX}\\d{16}:`).test(n));
    // newest-first: names are lex-ordered ascending by padded ts
    const picked = names.slice(-limit).reverse();
    const out: LedgerEvent[] = [];
    for (const name of picked) {
      const raw = await store.get(name);
      if (raw === null) continue;
      try {
        out.push(JSON.parse(raw) as LedgerEvent);
      } catch {
        continue; // corrupt row skipped: honest gap, not fabricated data
      }
    }
    return out;
  }

  return { append, recent };
}

function randomSuffix(): string {
  const c = globalThis.crypto;
  if (!c) return "0";
  const buf = new Uint8Array(4);
  c.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Wire the ledger into the auth route's verdicts + session lifecycle.
 *  Exported so ONLY one file owns the kind->verdict mapping (audit
 *  reads the same mapping back for the inbox). */
export function verdictKind(verdict: { verdict: string }): LedgerKind {
  switch (verdict.verdict) {
    case "send":
      return "auth.otp.requested";
    case "cooldown":
      return "auth.otp.cooldown";
    case "ok":
      return "auth.otp.verified";
    case "mismatch":
      return "auth.otp.failed";
    case "burned":
      return "auth.otp.burned";
    default:
      return "auth.otp.failed";
  }
}

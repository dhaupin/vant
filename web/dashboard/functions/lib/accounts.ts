import type { KVStore } from "./kv";

/**
 * The P2 account layer's pure logic (prd-web.md 3.5) - storage is
 * INJECTED so every rule here unit-tests against an in-memory store
 * with no runtime attached. Stated limits, all from the PRD:
 *   - codes are 6 digits (tunable), ~10-minute expiry, SINGLE-USE
 *   - codes stored HASHED (sha-256 + per-code random salt)
 *   - the account identifier is a HASHED email (deployment salt env)
 *   - verify attempts are budgeted; the request side has a cooldown
 *   - roles: admin|viewer; the FIRST account ever bootstraps as admin
 * Honest notes kept in code, not swept: the minimal KV shape has no
 * atomic ops, so the bootstrap-admin race resolves to whichever
 * writer lands last (a single-operator boot pattern, stated in the
 * docs rather than pretended atomic).
 */

// ---- tunables (PRD-shaped; a deployment overrides via env only) ----
export const OTP_TTL_SECONDS = 600;
/** The dashboard session cookie (the bsess_* server-side session). */
export const SESSION_COOKIE = "bdash_session";
export const OTP_MAX_ATTEMPTS = 5;
export const REQUEST_COOLDOWN_SECONDS = 60;
export const SESSION_TTL_SECONDS = 604_800; // 7 days
export const OTP_DIGITS = 6;

export type DashRole = "admin" | "viewer";

export interface AccountRecord {
  created: number;
  role: DashRole;
  status: "active" | "disabled";
}

export interface AccountsRow {
  emailHash: string;
  role: DashRole;
  status: "active" | "disabled";
  created: number;
}

export interface CodeRecord {
  hash: string; // sha-256(salt + ":" + code)
  salt: string;
  expires: number;
  attempts: number;
}

export interface SessionRecord {
  emailHash: string;
  role: DashRole;
  created: number;
  /** pod guest tokens bound SERVER-SIDE per property (prd-web.md 3.5) */
  tokens: Record<string, string>;
}

function subtleAvailable(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("no WebCrypto in this runtime");
  return c.subtle;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validEmailShape(raw: string): boolean {
  const e = normalizeEmail(raw);
  return (
    e.length >= 3 && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
  );
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await subtleAvailable().digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function emailHashFor(raw: string, salt: string): Promise<string> {
  return (await sha256Hex(salt + ":" + normalizeEmail(raw))).slice(0, 32);
}

/** 6-digit numeric code with rejection sampling (no modulo bias). */
export function generateOtp(digits: number = OTP_DIGITS): string {
  const c = globalThis.crypto;
  if (!c) throw new Error("no crypto in this runtime");
  const buf = new Uint32Array(1);
  const max = 10 ** digits;
  const limit = Math.floor(0xffff_ffff / max) * max;
  let v = 0;
  do {
    c.getRandomValues(buf);
    v = buf[0] >>> 0;
  } while (v >= limit);
  return String(v % max).padStart(digits, "0");
}

/** Per-code random salt so equal codes never share hashes. */
export async function hashCode(code: string, salt: string): Promise<string> {
  return sha256Hex(salt + ":" + code);
}

/** base64url, no padding. */
export function randomToken(bytes: number): string {
  const c = globalThis.crypto;
  if (!c) throw new Error("no crypto in this runtime");
  const buf = new Uint8Array(bytes);
  c.getRandomValues(buf);
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- key layout (single place so an audit reads one block) ----
export const keys = {
  code: (eh: string) => `code:${eh}`,
  throttle: (eh: string) => `throttle:${eh}`,
  account: (eh: string) => `acct:${eh}`,
  bootstrap: () => `meta:bootstrap-admin`,
  session: (id: string) => `sess:${id}`,
};

export interface AccountsApi {
  /** Issue path: "send" when a fresh code was minted (caller delivers
   *  it), "cooldown" when the per-email budget is running, or
   *  "invalid" for a malformed address. */
  requestOtp(
    email: string,
  ): Promise<{ verdict: "send"; code: string } | { verdict: "cooldown" } | { verdict: "invalid" }>;
  /** Verify path: burns the code on success. "burned" = attempts
   *  exhausted, then the row is deleted. */
  verifyOtp(
    email: string,
    code: string,
  ): Promise<
    | { verdict: "ok"; sessionId: string; account: AccountRecord }
    | { verdict: "mismatch" | "expired" | "burned" | "invalid" | "disabled" }
  >;
  sessionFor(sessionId: string): Promise<SessionRecord | null>;
  bindToken(sessionId: string, property: string, token: string): Promise<boolean>;
  destroySession(sessionId: string): Promise<boolean>;
  accountFor(sessionId: string): Promise<{ emailHash: string; role: DashRole } | null>;
  /** TRUE when the session is live AND its account row is active.
   *  Disabled accounts die at every gate through this one check. */
  accountActive(sessionId: string): Promise<boolean>;
  /** The users-module admin surface (catalog #13): roster + status.
   *  Newest-first, capped 200; the emailHash NEVER expands back. */
  listAccounts(): Promise<AccountsRow[]>;
  setAccountStatus(
    emailHash: string,
    status: AccountRecord["status"],
  ): Promise<boolean>;
}

export function makeAccounts(store: KVStore, emailSalt: string): AccountsApi {
  const now = () => Date.now();
  const ehFor = (email: string) => emailHashFor(email, emailSalt);

  async function readJson<T>(key: string): Promise<T | null> {
    const raw = await store.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null; // a corrupt row behaves as absent: a state, not a crash
    }
  }

  const api: AccountsApi = {
    async requestOtp(email) {
      if (!validEmailShape(email)) return { verdict: "invalid" };
      const eh = await ehFor(email);
      const throttled = (await store.get(keys.throttle(eh))) !== null;
      if (throttled) return { verdict: "cooldown" };

      const code = generateOtp();
      const salt = randomToken(12);
      const record: CodeRecord = {
        hash: await hashCode(code, salt),
        salt,
        expires: now() + OTP_TTL_SECONDS * 1000,
        attempts: OTP_MAX_ATTEMPTS,
      };
      await store.put(keys.code(eh), JSON.stringify(record), {
        expirationTtl: OTP_TTL_SECONDS,
      });
      await store.put(keys.throttle(eh), "1", {
        expirationTtl: REQUEST_COOLDOWN_SECONDS,
      });
      return { verdict: "send", code };
    },

    async verifyOtp(email, code) {
      if (!validEmailShape(email)) return { verdict: "invalid" };
      const eh = await ehFor(email);
      const record = await readJson<CodeRecord>(keys.code(eh));
      if (!record) return { verdict: "expired" };
      if (record.expires <= now()) {
        await store.delete(keys.code(eh));
        return { verdict: "expired" };
      }
      if (record.attempts <= 0) {
        await store.delete(keys.code(eh));
        return { verdict: "burned" };
      }

      const candidate = await hashCode(code.trim(), record.salt);
      if (!constantTimeEqual(candidate, record.hash)) {
        record.attempts -= 1;
        if (record.attempts <= 0) {
          await store.delete(keys.code(eh));
          return { verdict: "burned" };
        }
        await store.put(keys.code(eh), JSON.stringify(record), {
          expirationTtl: OTP_TTL_SECONDS,
        });
        return { verdict: "mismatch" };
      }

      // SUCCESS: single-use burn, account upsert, session mint
      await store.delete(keys.code(eh));
      let account = await readJson<AccountRecord>(keys.account(eh));
      if (account && account.status === "disabled") {
        return { verdict: "disabled" };
      }
      if (!account) {
        account = { created: now(), role: "viewer", status: "active" };
        const bootstrap = await store.get(keys.bootstrap());
        if (bootstrap === null) {
          account.role = "admin";
          await store.put(keys.bootstrap(), eh);
        }
        await store.put(keys.account(eh), JSON.stringify(account));
      }
      const sessionId = `bsess_${randomToken(32)}`;
      const session: SessionRecord = {
        emailHash: eh,
        role: account.role,
        created: now(),
        tokens: {},
      };
      await store.put(keys.session(sessionId), JSON.stringify(session), {
        expirationTtl: SESSION_TTL_SECONDS,
      });
      return { verdict: "ok", sessionId, account };
    },

    async sessionFor(sessionId) {
      if (typeof sessionId !== "string" || !sessionId.startsWith("bsess_")) return null;
      const rec = await readJson<SessionRecord>(keys.session(sessionId));
      if (!rec || !rec.created || rec.created + SESSION_TTL_SECONDS * 1000 <= now()) return null;
      return rec;
    },

    async bindToken(sessionId, property, token) {
      const rec = await api.sessionFor(sessionId);
      if (!rec) return false;
      rec.tokens[property] = token;
      await store.put(keys.session(sessionId), JSON.stringify(rec), {
        expirationTtl: SESSION_TTL_SECONDS,
      });
      return true;
    },

    async destroySession(sessionId) {
      await store.delete(keys.session(sessionId));
      return true;
    },

    async accountFor(sessionId) {
      const rec = await api.sessionFor(sessionId);
      return rec ? { emailHash: rec.emailHash, role: rec.role } : null;
    },

    async accountActive(sessionId) {
      const rec = await api.sessionFor(sessionId);
      if (!rec) return false;
      const account = await readJson<AccountRecord>(keys.account(rec.emailHash));
      return account ? account.status === "active" : true;
    },

    async listAccounts() {
      const names = (await store.list("acct:"))
        .map((r) => r.name)
        .filter((n) => /^acct:[0-9a-f]{32}$/.test(n))
        .slice(0, 200);
      const rows: AccountsRow[] = [];
      for (const name of names) {
        const account = await readJson<AccountRecord>(name);
        if (!account) continue; // honest gaps, never fabricated rows
        rows.push({ emailHash: name.slice("acct:".length), role: account.role, status: account.status, created: account.created });
      }
      rows.sort((a, b) => b.created - a.created);
      return rows;
    },

    async setAccountStatus(emailHash, status) {
      if (!/^[0-9a-f]{32}$/.test(emailHash)) return false;
      const account = await readJson<AccountRecord>(keys.account(emailHash));
      if (!account) return false;
      account.status = status;
      await store.put(keys.account(emailHash), JSON.stringify(account));
      return true;
    },
  };

  return api;
}

export { constantTimeEqual };

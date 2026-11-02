import type { AccountsApi, DashRole } from "./accounts";
import type { PagesContext } from "../types";
import { StoreUnavailableError, storeFor } from "./kv";
import { dashSessionId } from "./bridge";
import { makeAccounts, emailHashFor } from "./accounts";
import { PROVIDER_ENV_KEYS } from "./provider";

/**
 * The ONE admin gate for the dashboard-account surfaces (audit inbox,
 * users admin) - single source so a gate change lands once. Every
 * failure is a TYPED Response the UI renders verbatim (wave 19.16: the
 * refuses now say what state the caller is in AND what to do next; a
 * member support mailbox rides along when EMAIL_SUPPORT is set):
 *   E_NO_SESSION (401)         no live bsess session / cookie
 *   E_ACCOUNT_DISABLED (401)   the account row says disabled
 *   E_FORBIDDEN (403)          live session, wrong role
 *   E_STORE_UNCONFIGURED (503) no KV binding attached
 * Admin role law: first-verified bootstrap, OR the deterministic
 * BOLETE_ADMIN_ACCOUNT pin (accounts.ts wave 19.16) - the gate exposes
 * `protectedHash` so the users route can refuse disable on it.
 */
export type AdminGate =
  | {
      ok: true;
      api: AccountsApi;
      sessionId: string;
      role: DashRole;
      emailHash: string;
      /** The BOLETE_ADMIN_ACCOUNT pin's hash, or null when unset. */
      protectedHash: string | null;
      /** EMAIL_SUPPORT, lower-cased, or null when unset. */
      supportEmail: string | null;
    }
  | { ok: false; response: Response };

const typed = (payload: unknown, status: number): Response =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

export async function ensureAdmin(context: PagesContext): Promise<AdminGate> {
  let store;
  try {
    store = storeFor(context);
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return { ok: false, response: typed({ error: "E_STORE_UNCONFIGURED", detail: err.message }, 503) };
    }
    throw err;
  }
  const accounts = makeAccounts(store, emailSalt(context), envEmail(context) ?? undefined);
  const support = supportEmail(context);
  // (wave 19.18) the ONE guarded session read: a malformed-escape cookie
  // pair is not a crash (URIError -> raw 500, the users-list killer) -
  // it simply counts as no session, and the typed 401 says so.
  const sessionId = dashSessionId(context.request);
  if (!sessionId)
    return {
      ok: false,
      response: typed(
        {
          error: "E_NO_SESSION",
          detail: "no live dashboard session - sign in with the email-code gate on the front page, then come back to this surface",
          support,
        },
        401,
      ),
    };
  const who = await accounts.accountFor(sessionId);
  if (!who)
    return {
      ok: false,
      response: typed(
        {
          error: "E_NO_SESSION",
          detail: "your session expired - sign in again with the email-code gate; sessions live 7 days",
          support,
        },
        401,
      ),
    };
  if (!(await accounts.accountActive(sessionId))) {
    return {
      ok: false,
      response: typed(
        {
          error: "E_ACCOUNT_DISABLED",
          detail: "this account is disabled; only an admin can re-enable it - if you believe that is a mistake, reach the operator",
          support,
        },
        401,
      ),
    };
  }
  if (who.role !== "admin") {
    return {
      ok: false,
      response: typed(
        {
          error: "E_FORBIDDEN",
          detail:
            "this surface is admin-only: your account is signed in and active, but it is not the operator's admin role - if it should be, the operator can pin it via BOLETE_ADMIN_ACCOUNT or promote it on the users roster",
          support,
        },
        403,
      ),
    };
  }
  const pinned = envEmail(context);
  return {
    ok: true,
    api: accounts,
    sessionId,
    role: who.role,
    emailHash: who.emailHash,
    protectedHash: pinned ? await emailHashFor(pinned, emailSalt(context)) : null,
    supportEmail: support,
  };
}

/** The BOLETE_ADMIN_ACCOUNT env value (optional; shape-checked). */
function envEmail(context: PagesContext): string | null {
  const raw = context.env[PROVIDER_ENV_KEYS.adminAccount];
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** The EMAIL_SUPPORT env value (optional; lower-cased when set well). */
function supportEmail(context: PagesContext): string | null {
  const raw = context.env[PROVIDER_ENV_KEYS.supportEmail];
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

function emailSalt(context: PagesContext): string {
  const salt = context.env["VANT_EMAIL_SALT"];
  return typeof salt === "string" ? salt : "";
}

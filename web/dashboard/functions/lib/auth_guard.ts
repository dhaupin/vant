import type { AccountsApi, DashRole } from "./accounts";
import type { PagesContext } from "../types";
import { StoreUnavailableError, storeFor } from "./kv";
import { SESSION_COOKIE, makeAccounts } from "./accounts";

/**
 * The ONE admin gate for the dashboard-account surfaces (audit inbox,
 * users admin) - single source so a gate change lands once. Every
 * failure is a TYPED Response the UI renders verbatim:
 *   E_NO_SESSION (401)         no live bsess session / cookie
 *   E_ACCOUNT_DISABLED (401)   the account row says disabled
 *   E_FORBIDDEN (403)          live session, wrong role
 *   E_STORE_UNCONFIGURED (503) no KV binding attached
 */
export type AdminGate =
  | { ok: true; api: AccountsApi; sessionId: string; role: DashRole; emailHash: string }
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
  const accounts = makeAccounts(store, emailSalt(context));
  const cookie = context.request.headers.get("Cookie") ?? "";
  const row = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const sessionId = row ? decodeURIComponent(row.split("=").slice(1).join("=")) : null;
  if (!sessionId) return { ok: false, response: typed({ error: "E_NO_SESSION" }, 401) };
  const who = await accounts.accountFor(sessionId);
  if (!who) return { ok: false, response: typed({ error: "E_NO_SESSION" }, 401) };
  if (!(await accounts.accountActive(sessionId))) {
    return { ok: false, response: typed({ error: "E_ACCOUNT_DISABLED" }, 401) };
  }
  if (who.role !== "admin") {
    return { ok: false, response: typed({ error: "E_FORBIDDEN", detail: "this surface is admin-only" }, 403) };
  }
  return { ok: true, api: accounts, sessionId, role: who.role, emailHash: who.emailHash };
}

function emailSalt(context: PagesContext): string {
  const salt = context.env["VANT_EMAIL_SALT"];
  return typeof salt === "string" ? salt : "";
}

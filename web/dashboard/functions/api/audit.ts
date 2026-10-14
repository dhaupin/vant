import type { Handler, PagesContext } from "../types";
import { StoreUnavailableError, storeFor } from "../lib/kv";
import { SESSION_COOKIE, makeAccounts } from "../lib/accounts";
import { LEDGER_PREFIX, makeLedger } from "../lib/ledger";
import { json, rateGate, clientIp } from "../lib/bridge";

/**
 * GET /api/audit (module #11, /audit, Tier S - prd-web.md 4): reads the
 * frontend's OWN audit ledger - auth outcomes, refusals, session
 * lifecycles. ADMIN-ONLY: the reader session's role is checked against
 * the account store; viewer sessions get a typed 403, unauthenticated
 * a typed 401, a missing binding a typed 503. No PII travels back -
 * the ledger rows already hold only kinds + safe detail.
 */

export const onRequestGet: Handler = async (context: PagesContext) => {
  const budget = rateGate(context, "audit", clientIp(context.request));
  if (budget) return budget;

  let store;
  try {
    store = storeFor(context);
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return json({ error: "E_STORE_UNCONFIGURED", detail: err.message }, 503);
    }
    throw err;
  }

  const cookie = (context.request.headers.get("Cookie") ?? "");
  const row = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const sessionId = row ? decodeURIComponent(row.split("=").slice(1).join("=")) : null;
  if (!sessionId) return json({ error: "E_NO_SESSION" }, 401);
  const accounts = makeAccounts(store, emailSalt(context));
  const who = await accounts.accountFor(sessionId);
  if (!who) return json({ error: "E_NO_SESSION" }, 401);
  if (who.role !== "admin") {
    return json({ error: "E_FORBIDDEN", detail: "the audit inbox is admin-only" }, 403);
  }
  const limitParam = new URL(context.request.url).searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);
  const events = await makeLedger(store).recent(limit);
  return json({ events, prefix: LEDGER_PREFIX, count: events.length });
};

function emailSalt(context: PagesContext): string {
  const salt = context.env["VANT_EMAIL_SALT"];
  return typeof salt === "string" ? salt : "";
}

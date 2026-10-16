import type { Handler, PagesContext } from "../types";
import { storeFor } from "../lib/kv";
import { LEDGER_PREFIX, makeLedger } from "../lib/ledger";
import { ensureAdmin } from "../lib/auth_guard";
import { json, rateGate, clientIp } from "../lib/bridge";

/**
 * GET /api/audit (module #11, /audit, Tier S - prd-web.md 4): reads the
 * frontend's OWN audit ledger - auth outcomes, refusals, session
 * lifecycles - through the ONE admin gate (lib/auth_guard.ts): typed
 * 401 E_NO_SESSION / 401 E_ACCOUNT_DISABLED / 403 E_FORBIDDEN /
 * 503 E_STORE_UNCONFIGURED, never a swallow. No PII travels back -
 * ledger rows already hold only kinds + safe detail.
 */

export const onRequestGet: Handler = async (context: PagesContext) => {
  const budget = rateGate(context, "audit", clientIp(context.request));
  if (budget) return budget;

  const gate = await ensureAdmin(context);
  if (!gate.ok) return gate.response;

  const limitParam = new URL(context.request.url).searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);
  const events = await makeLedger(storeFor(context)).recent(limit);
  return json({ events, prefix: LEDGER_PREFIX, count: events.length });
};

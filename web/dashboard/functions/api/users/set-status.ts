import type { Handler, PagesContext } from "../../types";
import { storeFor } from "../../lib/kv";
import { makeLedger } from "../../lib/ledger";
import { ensureAdmin } from "../../lib/auth_guard";
import { clientIp, json, rateGate } from "../../lib/bridge";

/**
 * POST /api/users/set-status  {emailHash, status: active|disabled}
 * (catalog #13; prd-web.md 3.5): admin-only roster mutation - a
 * disabled account dies at EVERY gate (verify, session probe, bridge
 * bound tokens, audit) through accountActive(). Self-disable is
 * REFUSED with typed E_SELF_DISABLE - the honest lockout note. Wave
 * 19.16: the BOLETE_ADMIN_ACCOUNT pin is protected - disabling it
 * would brick the deterministic admin path, so the door refuses first
 * (battery: self-disable above stays for a non-pinned operator).
 *
 * (wave 19.20) a REAL route file: the logic lived only inside
 * POST /api/users while the roster UI (src/api.ts) called
 * /api/users/set-status - every toggle 404'd (Text: "status change
 * failed") forever. The handler MOVED here (index.ts POST delegates
 * to import the same module) so both URLs speak the ONE law.
 */

export const onRequestPost: Handler = async (context: PagesContext) => {
  const budget = rateGate(context, "users", clientIp(context.request));
  if (budget) return budget;
  const gate = await ensureAdmin(context);
  if (!gate.ok) return gate.response;

  let emailHash = "";
  let status = "";
  try {
    const body = (await context.request.json()) as { emailHash?: unknown; status?: unknown };
    if (typeof body.emailHash === "string") emailHash = body.emailHash.trim().toLowerCase();
    if (typeof body.status === "string") status = body.status;
  } catch {
    return json({ error: "E_BAD_BODY", detail: "JSON body with emailHash and status required" }, 400);
  }
  if (status !== "active" && status !== "disabled") {
    return json({ error: "E_BAD_STATUS", detail: "status must be active or disabled" }, 400);
  }
  if (status === "disabled" && gate.protectedHash && emailHash === gate.protectedHash) {
    return json(
      {
        error: "E_ADMIN_PROTECTED",
        detail:
          "this hash is the BOLETE_ADMIN_ACCOUNT operator pin - it cannot be disabled (re-point the env at another address first if you truly intend to retire it)",
      },
      409,
    );
  }
  if (emailHash === gate.emailHash && status === "disabled") {
    return json(
      { error: "E_SELF_DISABLE", detail: "you cannot disable your own account (typed lockout guard)" },
      400,
    );
  }
  const ok = await gate.api.setAccountStatus(emailHash, status);
  if (!ok) return json({ error: "E_NO_ACCOUNT", detail: "no account with that hash" }, 404);

  await makeLedger(storeFor(context)).append(
    status === "disabled" ? "auth.account.disabled" : "auth.account.activated",
    {}, // BY DESIGN no target hash in the ledger: the roster is the only place it lives
  );
  return json({ ok: true });
};

import type { Handler, PagesContext } from "../../types";
import { storeFor } from "../../lib/kv";
import { makeLedger } from "../../lib/ledger";
import { ensureAdmin } from "../../lib/auth_guard";
import { clientIp, json, rateGate } from "../../lib/bridge";

/**
 * The users-module admin surface (catalog #13; prd-web.md 3.5): the
 * dashboard's OWN accounts - distinct from pod guest identities. The
 * email is stored HASHED and the roster ships the hash (truncated on
 * the wire? no - the full hash is needed as the mutation key; hashed
 * emails are not reversible addresses, and that is the whole design).
 *
 * GET  /api/users
 *        -> admin-only roster: {emailHash, role, status, created}
 *           rows, newest-first, capped 200 at the store.
 * POST /api/users/set-status  {emailHash, status: active|disabled}
 *        -> admin-only. A disabled account dies at EVERY gate (verify,
 *           session probe, bridge bound tokens, audit) through
 *           accountActive(). Self-disable is REFUSED with typed
 *           E_SELF_DISABLE - the honest lockout note.
 */

export const onRequestGet: Handler = async (context: PagesContext) => {
  const budget = rateGate(context, "users", clientIp(context.request));
  if (budget) return budget;
  const gate = await ensureAdmin(context);
  if (!gate.ok) return gate.response;
  const users = await gate.api.listAccounts();
  return json({ users, count: users.length });
};

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

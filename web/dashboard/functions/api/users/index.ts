import type { Handler, PagesContext } from "../../types";
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

// (wave 19.20) the set-status law moved to its own module -
// api/users/set-status.ts - so POST /api/users/set-status (what the
// roster UI actually calls, src/api.ts) works AND POST /api/users
// keeps answering with the SAME handler, no drift.
export { onRequestPost } from "./set-status";

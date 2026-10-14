import type { Handler, PagesContext } from "../../types";
import { StoreUnavailableError, storeFor } from "../../lib/kv";
import { SESSION_COOKIE, makeAccounts } from "../../lib/accounts";
import { makeLedger } from "../../lib/ledger";
import { json } from "../../lib/bridge";

/**
 * GET    /api/auth/session  -> the dashboard account state, honestly:
 *          200 {role, bound: boolean} when a live bsess_ cookie reads,
 *          401 {error: "E_NO_SESSION"} otherwise. `bound` reports
 *          whether a pod guest token is bound SERVER-SIDE for the
 *          ?p= property (prd-web.md 3.5 session binding) - the client
 *          never sees the token itself, the hash, or the email.
 * DELETE /api/auth/session  -> destroys the server-side session and
 *          clears the cookie. Empty-cookie logout still answers ok.
 */

export const onRequestGet: Handler = async (context: PagesContext) => {
  let store;
  try {
    store = storeFor(context);
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return json(
        { error: "E_STORE_UNCONFIGURED", detail: err.message },
        503,
      );
    }
    throw err;
  }
  const sessionId = readSessionId(context.request);
  if (!sessionId) return json({ error: "E_NO_SESSION" }, 401);
  const accounts = makeAccounts(store, emailSalt(context));
  const session = await accounts.sessionFor(sessionId);
  if (!session) return json({ error: "E_NO_SESSION" }, 401);
  const property =
    new URL(context.request.url).searchParams.get("p") ?? "local";
  return json({
    role: session.role,
    bound: typeof session.tokens[property] === "string",
  });
};

export const onRequestDelete: Handler = async (context: PagesContext) => {
  const sessionId = readSessionId(context.request);
  if (sessionId) {
    try {
      const accounts = makeAccounts(storeFor(context), emailSalt(context));
      await accounts.destroySession(sessionId);
      // the ledger note records the LOGOUT event (no session id - PII-free)
      makeLedger(storeFor(context)).append("auth.session.destroyed", {});
    } catch {
      // store missing: the cookie is being cleared regardless
    }
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    },
  });
};

function readSessionId(request: Request): string | null {
  const cookie = request.headers.get("Cookie") ?? "";
  const row = cookie
    .split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return row ? decodeURIComponent(row.split("=").slice(1).join("=")) : null;
}

function emailSalt(context: PagesContext): string {
  const salt = context.env["VANT_EMAIL_SALT"];
  return typeof salt === "string" ? salt : "";
}

export { readSessionId };

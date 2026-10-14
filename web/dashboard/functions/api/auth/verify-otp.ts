import type { Handler, PagesContext } from "../../types";
import { StoreUnavailableError, storeFor } from "../../lib/kv";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  makeAccounts,
} from "../../lib/accounts";
import { makeLedger, verdictKind } from "../../lib/ledger";
import { clientIp, json, rateGate } from "../../lib/bridge";

/**
 * POST /api/auth/verify-otp  {email, code}
 * (prd-web.md 3.5): single-use verification against the HASHED code,
 * attempt-budgeted; success mints a session (`bsess_*`), serverside
 * bound, HttpOnly-cookie delivered. The FIRST account on a deployment
 * bootstraps as admin; every later one is viewer.
 */

export const onRequestPost: Handler = async (context: PagesContext) => {
  const budget = rateGate(context, "auth", clientIp(context.request));
  if (budget) return budget;

  let email = "";
  let code = "";
  try {
    const body = (await context.request.json()) as { email?: unknown; code?: unknown };
    if (typeof body.email === "string") email = body.email;
    if (typeof body.code === "string") code = body.code;
  } catch {
    return json({ error: "E_BAD_BODY", detail: "JSON body with email and code required" }, 400);
  }

  let store;
  try {
    store = storeFor(context);
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return json({ error: "E_STORE_UNCONFIGURED", detail: err.message }, 503);
    }
    throw err;
  }
  const accounts = makeAccounts(store, emailSalt(context));
  const ledger = makeLedger(store);
  const verdict = await accounts.verifyOtp(email, code);

  switch (verdict.verdict) {
    case "ok": {
      const { account } = verdict;
      await ledger.append(verdictKind(verdict));
      await ledger.append("auth.session.created", { role: account.role });
      return new Response(
        JSON.stringify({ ok: true, role: account.role }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": setCookieFor(verdict.sessionId),
          },
        },
      );
    }
    case "invalid":
      await ledger.append("auth.otp.failed", { reason: "invalid_email" });
      return json({ error: "E_EMAIL_INVALID", detail: "that is not an email address shape" }, 400);
    case "mismatch":
      await ledger.append(verdictKind(verdict));
      return json({ error: "E_OTP_MISMATCH", detail: "that code is not right (attempts are budgeted)" }, 401);
    case "burned":
      await ledger.append(verdictKind(verdict));
      return json({ error: "E_OTP_BURNED", detail: "too many attempts; request a fresh code" }, 401);
    case "expired":
      await ledger.append("auth.otp.failed", { reason: "expired" });
      return json({ error: "E_OTP_EXPIRED", detail: "no live code for this address; request one" }, 401);
  }
};

export function setCookieFor(sessionId: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

function emailSalt(context: PagesContext): string {
  const salt = context.env["VANT_EMAIL_SALT"];
  return typeof salt === "string" ? salt : "";
}

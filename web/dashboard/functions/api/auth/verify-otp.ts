import type { Handler, PagesContext } from "../../types";
import { StoreUnavailableError, storeFor } from "../../lib/kv";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  makeAccounts,
} from "../../lib/accounts";
import { makeLedger, verdictKind } from "../../lib/ledger";
import { clientIp, json, rateGate } from "../../lib/bridge";
import { PROVIDER_ENV_KEYS } from "../../lib/provider";

/**
 * POST /api/auth/verify-otp  {email, code}
 * (prd-web.md 3.5): single-use verification against the HASHED code,
 * attempt-budgeted; success mints a session (`bsess_*`), serverside
 * bound, HttpOnly-cookie delivered. The FIRST account on a deployment
 * bootstraps as admin; every later one is viewer. Wave 19.16: the
 * BOLETE_ADMIN_ACCOUNT env pin overrides the race - the named email
 * verifies/veterans straight to admin (accounts.ts owns that law);
 * EMAIL_SUPPORT personalizes the disabled-account refusal.
 */

/** The BOLETE_ADMIN_ACCOUNT env value (optional; shape-checked). */
function adminEnv(context: PagesContext): string | null {
  const raw = context.env[PROVIDER_ENV_KEYS.adminAccount];
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** The EMAIL_SUPPORT env value (optional; lower-cased when set well). */
function support(context: PagesContext): string | null {
  const raw = context.env[PROVIDER_ENV_KEYS.supportEmail];
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

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
  const accounts = makeAccounts(store, emailSalt(context), adminEnv(context) ?? undefined);
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
    case "disabled":
      await ledger.append("auth.otp.failed", { reason: "account_disabled" });
      return json(
        {
          error: "E_ACCOUNT_DISABLED",
          detail:
            "this account is disabled; an admin re-enables it" +
            (support ? ` - reach the operator at ${support} if that was a mistake` : ""),
        },
        403,
      );
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

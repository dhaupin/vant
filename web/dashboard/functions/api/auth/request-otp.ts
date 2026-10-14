import type { Handler, PagesContext } from "../../types";
import {
  EmailDeliveryError,
  EmailSenderUnavailableError,
  sendOtpEmail,
} from "../../lib/email";
import { StoreUnavailableError, storeFor } from "../../lib/kv";
import { OTP_TTL_SECONDS, makeAccounts } from "../../lib/accounts";
import { clientIp, json, rateGate } from "../../lib/bridge";

/**
 * POST /api/auth/request-otp  {email}
 * (prd-web.md 3.5): mint a 6-digit single-use code, stored HASHED with
 * a 10-minute TTL, throttled per email (cooldown), and sent by the
 * deployment's configured sender. Every outcome is a TYPED state the
 * UI renders - a refusal is never swallowed, a success never faked.
 */

export const onRequestPost: Handler = async (context: PagesContext) => {
  const budget = rateGate(context, "auth", clientIp(context.request));
  if (budget) return budget;

  let email = "";
  try {
    const body = (await context.request.json()) as { email?: unknown };
    if (typeof body.email === "string") email = body.email;
  } catch {
    return json({ error: "E_BAD_BODY", detail: "JSON body with email required" }, 400);
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
  const verdict = await accounts.requestOtp(email);
  if (verdict.verdict === "invalid") {
    return json({ error: "E_EMAIL_INVALID", detail: "that is not an email address shape" }, 400);
  }
  if (verdict.verdict === "cooldown") {
    return json(
      { error: "E_OTP_COOLDOWN", detail: "a code was requested for this address recently" },
      429,
    );
  }

  try {
    await sendOtpEmail(context, { to: email.trim(), code: verdict.code, ttlMinutes: Math.round(OTP_TTL_SECONDS / 60) });
  } catch (err) {
    if (err instanceof EmailSenderUnavailableError) {
      return json({ error: "E_EMAIL_UNCONFIGURED", detail: err.message }, 503);
    }
    if (err instanceof EmailDeliveryError) {
      return json({ error: "E_EMAIL_DELIVERY", detail: err.message }, 502);
    }
    return json({ error: "E_EMAIL_DELIVERY", detail: "sender failed" }, 502);
  }
  return json({ ok: true });
};

function emailSalt(context: PagesContext): string {
  const salt = context.env["VANT_EMAIL_SALT"];
  return typeof salt === "string" ? salt : "";
}

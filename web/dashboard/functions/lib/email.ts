import type { PagesContext } from "../types";

/**
 * The OTP sender (prd-web.md 3.5, build-time provider pick): a
 * provider-AGNOSTIC interface inside the Pages functions - plain HTTPS
 * fetch to an env-configured endpoint, NO SDK (Worker code stays
 * fetch-shaped; the frontend's toolchain deps never leak into lean
 * surfaces).
 *
 * Config, BOTH in Pages settings (prd-web.md 3.7), never in code:
 *   Primary pick (PRD-named Resend): RESEND_API_KEY + EMAIL_FROM
 *     -> https://api.resend.com/emails (a JSON POST - fetch only)
 *   Generic fallback (any provider): EMAIL_WEBHOOK_URL + optional
 *     EMAIL_WEBHOOK_TOKEN -> POST JSON {to, subject, text}
 *   Nothing set is a STATE: EmailSenderUnavailableError (typed 503 at
 *   the route), never a fake "sent".
 *
 * The recipient address leaves this process ONLY for delivery and is
 * never logged (prd-web.md 6 token/log hygiene class).
 */

export class EmailSenderUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EmailSenderUnavailable";
  }
}

export class EmailDeliveryError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "EmailDelivery";
  }
}

export interface OTPMessage {
  to: string;
  code: string;
  ttlMinutes: number;
}

const SUBJECT = "Your Bolete dashboard sign-in code";

function bodyText(m: OTPMessage): string {
  return [
    "Your dashboard sign-in code:",
    "",
    `    ${m.code}`,
    "",
    `It expires in ${m.ttlMinutes} minutes and can be used once.`,
    "If you did not request this, you can ignore this email.",
  ].join("\n");
}

/** Decide + send through whichever provider the deployment configured. */
export async function sendOtpEmail(context: PagesContext, m: OTPMessage): Promise<void> {
  const text = bodyText(m);
  const apiKey = context.env["RESEND_API_KEY"];
  const from = context.env["EMAIL_FROM"];
  if (typeof apiKey === "string" && apiKey.length > 0 && typeof from === "string" && from.length > 0) {
    await sendViaResend(apiKey, from, m, text);
    return;
  }
  const hookUrl = context.env["EMAIL_WEBHOOK_URL"];
  const hookToken = context.env["EMAIL_WEBHOOK_TOKEN"];
  if (typeof hookUrl === "string" && hookUrl.length > 0) {
    await sendViaWebhook(hookUrl, hookToken, m, text);
    return;
  }
  throw new EmailSenderUnavailableError(
    "no email sender configured: set RESEND_API_KEY + EMAIL_FROM (or EMAIL_WEBHOOK_URL) in Pages settings",
  );
}

async function sendViaResend(apiKey: string, from: string, m: OTPMessage, text: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [m.to],
        subject: SUBJECT,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EmailDeliveryError("sender endpoint unreachable");
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new EmailDeliveryError(`sender refused: HTTP ${res.status}${detail ? " " + detail : ""}`);
  }
}

async function sendViaWebhook(url: string, token: unknown, m: OTPMessage, text: string): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof token === "string" && token.length > 0) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ to: m.to, subject: SUBJECT, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EmailDeliveryError("sender endpoint unreachable");
  }
  if (!res.ok) {
    throw new EmailDeliveryError(`sender webhook refused: HTTP ${res.status}`);
  }
}

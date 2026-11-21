import type { Handler, PagesContext } from "../types";
import { establishSession, clearSession, json } from "../lib/bridge";

export const onRequestPost: Handler = async (context: PagesContext) => {
  const property = new URL(context.request.url).searchParams.get("p") ?? "local";
  return establishSession(context.request, context.env, property);
};

export const onRequestDelete: Handler = async (context: PagesContext) => {
  const property = new URL(context.request.url).searchParams.get("p") ?? "local";
  return clearSession(property);
};

/** Without this, a GET falls through to the SPA asset and answers 200 HTML,
 *  so a mistyped method reads as success instead of a routing error. */
export const onRequestGet: Handler = async () =>
  json({ error: "E_METHOD_NOT_ALLOWED", allow: "POST, DELETE" }, 405);

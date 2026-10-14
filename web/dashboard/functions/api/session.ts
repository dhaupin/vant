import type { Handler, PagesContext } from "../types";
import { establishSession, clearSession } from "../lib/bridge";

export const onRequestPost: Handler = async (context: PagesContext) => {
  const property = new URL(context.request.url).searchParams.get("p") ?? "local";
  return establishSession(context.request, property);
};

export const onRequestDelete: Handler = async (context: PagesContext) => {
  const property = new URL(context.request.url).searchParams.get("p") ?? "local";
  return clearSession(property);
};

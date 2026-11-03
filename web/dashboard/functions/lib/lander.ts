import type { PagesContext } from "../types";
import { StoreUnavailableError, storeFor } from "./kv";

/**
 * The lander store (wave 19.28, the OSS setting): ONE KV key carries the
 * operator's signed-out landing content. Reading is public BY CONTRACT -
 * the lander content renders for the anonymous visitor (it is the page
 * they are looking at; a public read leaks nothing the render itself
 * does not already show). Writing is admin-gated at the route (the ONE
 * gate, ensure_admin), never here.
 *
 * The html lane is sanitized at WRITE: the operator's own content, but
 * hygiene is not censorship — a stray <script> inside a pasted widget is
 * an accident waiting at the anonymous surface, so script/iframe/object/
 * embed frames and on* handlers and javascript:/data: URLs are dropped
 * here, once, at the single choke point. The md lane is stored verbatim:
 * the client's lilmd renderer escapes everything before it renders.
 */

export const LANDER_KEY = "lander:content";
export const LANDER_FIELD_MAX = 12000;

export interface LanderContent {
  html: string;
  md: string;
}

export interface StoreLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Typed: the store call refuses UP HERE (E_STORE_UNCONFIGURED), so a
 *  route handler never invents its own 503 shape. */
export async function readLander(store: StoreLike): Promise<LanderContent | null> {
  const raw = await store.get(LANDER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { html?: unknown; md?: unknown };
    if (typeof parsed !== "object" || parsed === null) return null;
    const html = typeof parsed.html === "string" ? parsed.html : "";
    const md = typeof parsed.md === "string" ? parsed.md : "";
    if (!html && !md) return null;
    return { html, md };
  } catch {
    return null;
  }
}

export async function writeLander(store: StoreLike, content: LanderContent): Promise<void> {
  await store.put(LANDER_KEY, JSON.stringify({ v: 1, ...content }));
}

export async function clearLander(store: StoreLike): Promise<void> {
  await store.delete(LANDER_KEY);
}

/** The context-shaped helper every route uses; typed refusal on no-KV. */
export async function landerStore(context: PagesContext) {
  const store = storeFor(context);
  return store;
}

export { StoreUnavailableError };

/**
 * sanitizeOwnedHtml — the ONE strip the operator's html lane carries.
 * Best-effort by design (documented): the owner admin already trusts
 * their own words; the strip is the tripwire for a pasted widget with a
 * rider in it. Drops: <script>/<iframe>/<object>/<embed> elements
 * (balanced or not — the opening tag eats the element), every on*
 * attribute, and javascript:/data: url values (link + iframe srcs).
 */
export function sanitizeOwnedHtml(dirty: string): string {
  let out = dirty;
  out = out.replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*>/gi, "")
    .replace(/<\/script\s*>/gi, "");
  out = out.replace(/<(iframe|object|embed|link|meta)[^>]*>([\s\S]*?<\/\1[^>]*>)?/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi, '$1="#"');
  out = out.replace(/(href|src)\s*=\s*("data:[^"]*"|'data:[^']*'|data:[^\s>]*)/gi, '$1="#"');
  return out;
}

/** The write-side field law: html optional, md optional, both capped. */
export function shapeLander(body: unknown): { ok: true; content: LanderContent } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "E_LANDER_SHAPE: the save body is not an object" };
  }
  const raw = body as { html?: unknown; md?: unknown };
  const html = typeof raw.html === "string" ? raw.html.trim() : "";
  const md = typeof raw.md === "string" ? raw.md.trim() : "";
  if (!html && !md) {
    return { ok: false, error: "E_LANDER_EMPTY: give at least one of html / md (or send a DELETE to reset)" };
  }
  if (html.length > LANDER_FIELD_MAX) {
    return { ok: false, error: `E_LANDER_TOO_LARGE: html is ${html.length} chars (max ${LANDER_FIELD_MAX})` };
  }
  if (md.length > LANDER_FIELD_MAX) {
    return { ok: false, error: `E_LANDER_TOO_LARGE: md is ${md.length} chars (max ${LANDER_FIELD_MAX})` };
  }
  return { ok: true, content: { html: sanitizeOwnedHtml(html), md } };
}

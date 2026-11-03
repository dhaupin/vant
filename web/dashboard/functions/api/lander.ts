import type { Handler, PagesContext } from "../types";
import { StoreUnavailableError, storeFor } from "../lib/kv";
import {
  clearLander,
  landerStore,
  readLander,
  shapeLander,
  writeLander,
} from "../lib/lander";
import { ensureAdmin } from "../lib/auth_guard";

/**
 * /api/lander (wave 19.28, the OSS setting).
 *
 *   GET    public   -> { custom: null } | { custom: { html, md } }
 *                      The signed-out lander content, as stored. Public by
 *                      contract: this is the page the anonymous visitor is
 *                      already being served. Missing store -> { custom:
 *                      null } with the honest undefined-fn posture kept by
 *                      the client (its built-in gloss shows either way).
 *   PUT    admin    -> saves { html?, md? } (the html lane is sanitized at
 *                      write; typed E_LANDER_* refusals, never a guess).
 *   DELETE admin    -> resets to the built-in gloss (the key is deleted).
 */

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

export const onRequestGet: Handler = async (context: PagesContext) => {
  try {
    const store = await landerStore(context);
    const custom = await readLander(store);
    return json({ custom });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      // Same honest posture the account surfaces keep: no binding is a
      // typed absence, never a fabricated record.
      return json({ custom: null, error: "E_STORE_UNCONFIGURED", detail: err.message });
    }
    throw err;
  }
};

export const onRequestPut: Handler = async (context: PagesContext) => {
  let gate: Awaited<ReturnType<typeof ensureAdmin>>;
  try {
    gate = await ensureAdmin(context);
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return json({ error: "E_STORE_UNCONFIGURED", detail: err.message }, 503);
    }
    throw err;
  }
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "E_LANDER_SHAPE: the save body is not JSON" }, 400);
  }
  const shaped = shapeLander(body);
  if (!shaped.ok) return json({ error: shaped.error }, 400);
  try {
    const store = storeFor(context);
    await writeLander(store, shaped.content);
    return json({ ok: true, custom: await readLander(store) });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return json({ error: "E_STORE_UNCONFIGURED", detail: err.message }, 503);
    }
    throw err;
  }
};

export const onRequestDelete: Handler = async (context: PagesContext) => {
  let gate: Awaited<ReturnType<typeof ensureAdmin>>;
  try {
    gate = await ensureAdmin(context);
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return json({ error: "E_STORE_UNCONFIGURED", detail: err.message }, 503);
    }
    throw err;
  }
  if (!gate.ok) return gate.response;
  try {
    const store = storeFor(context);
    await clearLander(store);
    return json({ ok: true, custom: null });
  } catch (err) {
    if (err instanceof StoreUnavailableError) {
      return json({ error: "E_STORE_UNCONFIGURED", detail: err.message }, 503);
    }
    throw err;
  }
};

import type { KVNamespaceLike, PagesContext } from "../types";

/**
 * The account store access (prd-web.md 3.5, build-day decision): the
 * binding is K V, chosen at build time over D1 because codes and
 * sessions need native TTLs and the map stays tiny. The binding NAME is
 * the only thing code knows - `BOLETE_KV` is configured in Pages
 * settings per deployment (prd-web.md 3.7: zero wrangler strings).
 * Missing binding = a typed 503 the UI renders honestly, never a
 * pretend record.
 */

export const KV_BINDING = "BOLETE_KV";

export class StoreUnavailableError extends Error {
  constructor() {
    super(
      `the ${KV_BINDING} binding is not configured in this Pages project`,
    );
    this.name = "StoreUnavailable";
  }
}

export interface KVStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The deployment leaves the binding undefined until an owner attaches
 *  it; callers treat that as a STATE (typed refusal), not a crash. */
export function storeFor(context: PagesContext): KVStore {
  const binding = context.env[KV_BINDING];
  if (!binding || typeof binding !== "object") throw new StoreUnavailableError();
  const ns = binding as Partial<KVNamespaceLike>;
  if (
    typeof ns.get !== "function" ||
    typeof ns.put !== "function" ||
    typeof ns.delete !== "function"
  ) {
    throw new StoreUnavailableError();
  }
  return ns as KVStore;
}

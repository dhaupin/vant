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
  list(prefix: string): Promise<Array<{ name: string }>>;
}

/** What a REAL Workers KV namespace answers from list(): a page object
 *  with cursor pagination - not the plain row array the KVStore
 *  contract (and every consumer) speaks. The adapter lives HERE, the
 *  one choke point every store consumer rides (accounts roster, audit
 *  ledger), instead of trusting the wishful declaration. Live-caught
 *  2026-11-02 on brain.creadev.org: /api/users answered 500 because
 *  listAccounts().map() hit this page object; the in-test memory
 *  stores hid it because they already answered the array shape. */
interface RealListOptions {
  prefix?: string;
  cursor?: string;
  limit?: number;
}

interface RealListPage {
  keys?: Array<{ name?: string }>;
  list_complete?: boolean;
  cursor?: string;
}

/** Bounded paging: at most 100 x 1000 keys per request-path call.
 *  Honesty over unbounded traversal. */
const MAX_LIST_PAGES = 100;

/** The deployment leaves the binding undefined until an owner attaches
 *  it; callers treat that as a STATE (typed refusal), not a crash. */
export function storeFor(context: PagesContext): KVStore {
  const binding = context.env[KV_BINDING];
  if (!binding || typeof binding !== "object") throw new StoreUnavailableError();
  const ns = binding as Partial<KVNamespaceLike>;
  if (
    typeof ns.get !== "function" ||
    typeof ns.put !== "function" ||
    typeof ns.delete !== "function" ||
    typeof ns.list !== "function"
  ) {
    throw new StoreUnavailableError();
  }
  const get = (ns.get as (key: string) => Promise<string | null>).bind(ns);
  const put = (ns.put as (
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ) => Promise<void>).bind(ns);
  const del = (ns.delete as (key: string) => Promise<void>).bind(ns);
  // The runtime's list() takes the OBJECT-options form; the declared
  // KVNamespaceLike is the wish. Narrow cast at the one call site.
  const realList = ns.list as unknown as (
    options: RealListOptions,
  ) => Promise<Array<{ name: string }> | RealListPage>;

  return {
    async get(key) {
      return get(key);
    },
    async put(key, value, options) {
      await put(key, value, options);
    },
    async delete(key) {
      await del(key);
    },
    async list(prefix) {
      const rows: Array<{ name: string }> = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_LIST_PAGES; page++) {
        const result = await realList({ prefix, cursor, limit: 1000 });
        // A namespace that already answers the minimal-shape array
        // (test shims, thin local adapters) passes through untouched.
        if (Array.isArray(result)) return result;
        for (const key of result.keys ?? []) {
          if (typeof key?.name === "string") rows.push({ name: key.name });
        }
        if (result.list_complete) return rows;
        if (typeof result.cursor !== "string") return rows; // nothing to follow; stop quietly
        cursor = result.cursor;
      }
      return rows;
    },
  };
}

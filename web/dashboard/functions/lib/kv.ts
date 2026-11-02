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
  // (wave 19.19) get/put/delete are .bind()-ed above, but list was left
  // detached - the one prod-only 500 left standing: every test shim
  // hangs list on a plain object (a free function), while the REAL
  // workerd namespace is a class-backed platform object whose methods
  // need `this`. A detached ns.list(...) threw inside the adapter on
  // EVERY production list call - /api/users and /api/audit answered
  // bare "error code: 1101" for live admin sessions while
  // /api/auth/session (which never lists) sailed through 200.
  // Live-caught 2026-11-02 by signing in as the operator and bracketing
  // the failure between fake-cookie (typed 401) and the roster/audit
  // routes: same binding, same get() - only the detached list was left.
  const realList = (ns.list as unknown as (
    options: RealListOptions,
  ) => Promise<Array<{ name: string }> | RealListPage>).bind(ns);

  // The pages-walk helper + the dual-contract normalization (wave 19.22):
  // the OBJECT-options call is the real workerd law, but the plain-object
  // test shims (and the cyber page adapters) speak the positional-prefix
  // KVStore contract - live-caught by the crashtest run root: a positional
  // shim given the object form prefix-matches the literal
  // "[object Object]" and answers an honest-looking empty array, which
  // the roster/audit inboxes dutifully read back as count=0. So: ask
  // object-first; whenever the object answer is an ARRAY (could be an
  // honest array-shaped store, could be a positional shim silently lying
  // empty), re-ask positionally and prefer whichever answer carries rows.
  // A real namespace NEVER answers an array, so the page-walk only ever
  // serves the platform binding.
  const normalizeRows = (
    answer: Array<{ name: string }> | RealListPage | undefined,
  ): Array<{ name: string }> | null => {
    if (Array.isArray(answer)) return answer.map((r) => ({ name: r.name }));
    if (answer && Array.isArray(answer.keys)) {
      const rows: Array<{ name: string }> = [];
      for (const k of answer.keys as Array<{ name?: string }>) {
        if (typeof k?.name === "string") rows.push({ name: k.name });
      }
      return rows;
    }
    return null; // not a shape we can read
  };
  const callPositional = async (prefix: string): Promise<Array<{ name: string }> | null> => {
    try {
      const answer = (await (realList as unknown as (p: string) => Promise<unknown>)(prefix)) as
        | Array<{ name: string }>
        | RealListPage
        | undefined;
      return normalizeRows(answer);
    } catch {
      return null; // positional not spoken here either; caller falls back to its object answer
    }
  };

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
      let objectAnswer: Awaited<ReturnType<typeof realList>>;
      try {
        objectAnswer = await realList({ prefix, limit: 1000 });
      } catch {
        // The binding tolerates only the positional contract on this
        // shelf (old adapters, custom shims): read positionally and
        // normalize whatever shape comes back.
        const positional = await callPositional(prefix);
        return positional ?? [];
      }
      if (!Array.isArray(objectAnswer)) {
        // The platform page-walk path (real workerd namespaces only).
        const rows: Array<{ name: string }> = [];
        let cursor: string | undefined;
        let page: RealListPage = objectAnswer as RealListPage;
        for (let i = 0; i < MAX_LIST_PAGES; i++) {
          for (const key of page.keys ?? []) {
            if (typeof key?.name === "string") rows.push({ name: key.name });
          }
          if (page.list_complete) return rows;
          if (typeof page.cursor !== "string") return rows; // nothing to follow; stop quietly
          cursor = page.cursor;
          page = (await realList({ prefix, cursor, limit: 1000 })) as RealListPage;
        }
        return rows;
      }
      // Array answer: ambiguous between "honest array-shaped store" and
      // "positional shim that silently returned [] for the object arg".
      // The positional re-ask decides: whoever holds more truth rides.
      const positional = await callPositional(prefix);
      if (positional && positional.length > objectAnswer.length) return positional;
      return objectAnswer.map((r) => ({ name: r.name }));
    },
  };
}

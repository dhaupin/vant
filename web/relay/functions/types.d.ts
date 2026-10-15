/** Minimal Pages-function shapes (shared with the dashboard flavor; the
 *  runtime unfolds via env bindings defined in Pages settings - prd-web.md
 *  3.7). Functions read env at REQUEST time, never as code strings. */

/** The KV/Namespace shape (the dashboard P2 store uses; the solo relay
 *  uses NO KV at all - nothing to store, by construction). */
export interface KVNamespaceLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    /** minimal list shape: names only, lex-ordered by key */
    list(prefix: string): Promise<Array<{ name: string }>>;
}

export interface PagesEnv {
    [key: string]: unknown;
}

export interface PagesContext {
    request: Request;
    env: PagesEnv;
    params: Record<string, string | string[]>;
}

export type Handler = (context: PagesContext) => Promise<Response>;

/** Minimal Pages-function shapes (NO dependency on wrangler strings; the
 *  runtime unfolds via env bindings defined in Pages settings - prd-web.md
 *  3.7). Functions read env at REQUEST time, never as code strings. */

/** The KV/Namespace shape the P2 account store uses (prd-web.md 3.5).
 *  Deliberately a MINIMAL subset of the Workers KV API so a D1-backed
 *  replacement stays a one-file swap later if an install prefers it. */
export interface KVNamespaceLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
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

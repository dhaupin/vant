/** Minimal Pages-function shapes (NO dependency on wrangler strings; the
 *  runtime unfolds via env bindings defined in Pages settings - prd-web.md
 *  3.7). Functions read env at REQUEST time, never as code strings. */
export interface PagesEnv {
  [key: string]: string | undefined;
}

export interface PagesContext {
  request: Request;
  env: PagesEnv;
  params: Record<string, string | string[]>;
}

export type Handler = (context: PagesContext) => Promise<Response>;

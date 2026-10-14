import type { Handler } from "../types";

/**
 * GET /api/properties - the property registry for the switcher (prd-web.md
 * 3.4: the registry lives in Pages settings env vars; the frontend needs
 * to KNOW ids + labels to offer them, but must NEVER see origins or
 * anything secret - the bridge resolves origins server-side only).
 */
export const onRequestGet: Handler = async ({ env }) => {
  const properties: Array<{ id: string; name: string }> = [];
  for (const key of Object.keys(env)) {
    const m = /^VANT_PROPERTY_([A-Z0-9_]+)_ORIGIN$/.exec(key);
    if (!m) continue;
    const id = m[1].toLowerCase().replace(/_/g, "-");
    if (!/^[a-z0-9-]{1,40}$/.test(id)) continue;
    const label = env[`VANT_PROPERTY_${m[1]}_NAME`];
    properties.push({ id, name: typeof label === "string" && label ? label : id });
  }
  return new Response(JSON.stringify({ properties }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export {};

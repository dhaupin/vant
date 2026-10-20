import { useSyncExternalStore } from "react";

/**
 * The frontend's own state, keyed per attached property (prd-web.md 3.4).
 * Tokens live in MEMORY ONLY (MVP paste; worker-side session binding is
 * the P2 upgrade - prd-web.md 3.5). Nothing here touches localStorage
 * except non-sensitive UI prefs (theme, help visibility).
 */

export type Tier = "O" | "H" | "A" | "S";

/** The dashboard account (P2 email-OTP, prd-web.md 3.5). The server
 *  never shows the email or its hash to the browser - only the role.
 *  Pod guest tokens stay MEMORY ONLY below. */
export type DashRole = "admin" | "viewer";

export interface AppState {
  /** one pasted vguest_ token per property id (never persisted) */
  tokens: Record<string, string>;
  /** live dashboard session, probed from the server on load; null =
   *  no account session (the paste gate stays the fallback) */
  account: { role: DashRole } | null;
  /** properties with a SERVER-BOUND pod token for this session */
  boundFor: string[];
  /** URL ride-along property id (prd-web.md 3.4); default single property */
  property: string;
  theme: "light" | "dark" | "system";
  help: boolean;
  /** the USER'S relay-usage choice (prd-relay.md 6.1: reach this pod
   *  through relay hops = on / direct = off). Non-sensitive UI pref,
   *  persisted like theme; the SERVING posture is the operator's and
   *  lives in Pages/pod env - the two sides never blur (6.1). */
  relayUsage: boolean;
  /** the web/relay endpoint the user runs the dashboard WITH (the owner's
   *  corrected arc: dashboard USES /web/relay as a setting, pass-233).
   *  A plain origin URL the user enters + verifies live against that
   *  relay's public capabilities page; non-sensitive (caps are public,
   *  secrets-free by contract), persisted like the other reach prefs. */
  relayEndpoint: string;
  /** (P6b rung, prd-relay.md 3.3/6.1) THE USER'S chain, order matters:
   *  the hops added by decision in Settings, each badged from its OWN
   *  verified caps read (never a guess). Non-sensitive entries only:
   *  origins + caps metadata, persisted like the other reach prefs. */
  chain: ChainHop[];
  /** the e2e channel key BOUND at pairwise redeem (per property; the binding
   *  moment's one-time delivery). Held like the pasted tokens: memory AND a
   *  sessionStorage copy — never localStorage, never any server surface. */
  channelKeys: Record<string, string>;
  /** the honest ROUTE RECORD from the last door call: which lane actually
   *  answered, named plainly ('sealed-ride-e2e' | 'own-edge-bridge' |
   *  'direct' | a fail-over story). Memory-only, read by /chain. */
  lastRoute: string | null;
}

/** a chain hop: the user's verified read of one origin's caps (P6b). */
export interface ChainHop {
  id: string;
  origin: string;
  flavor: string;
  e2e: string;
  added: number;
}

const listeners = new Set<() => void>();
let state: AppState = {
  tokens: {},
  account: null,
  boundFor: [],
  property: readPropertyFromUrl(),
  theme: (readRawPref("bolete-theme") as AppState["theme"] | null) ?? "system",
  help: readRawPref("bolete-help") !== "0",
  relayUsage: readRawPref("bolete-relay-usage") === "1",
  relayEndpoint: readRawPref("bolete-relay-endpoint") ?? "",
  chain: readChain("bolete-chain"),
  channelKeys: {},
  lastRoute: null,
};

/** the persisted chain read (non-sensitive: origins + caps metadata only). */
function readChain(key: string): ChainHop[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (h): h is ChainHop =>
          !!h && typeof (h as ChainHop).origin === "string"
          && typeof (h as ChainHop).id === "string"
          && /^https:\/\//.test((h as ChainHop).origin),
      )
      .slice(0, 16);
  } catch {
    return [];
  }
}

function readRawPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private mode: session-only preference
  }
}

export function readPropertyFromUrl(): string {
  try {
    const p = new URLSearchParams(window.location.search).get("p");
    // strict charset - property ids are simple kebab ids
    return p && /^[a-z0-9-]{1,40}$/.test(p) ? p : "local";
  } catch {
    return "local";
  }
}

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function useAppRaw(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export const getState = () => state;

export const actions = {
  setToken(property: string, token: string | null) {
    const tokens = { ...state.tokens };
    if (token) tokens[property] = token;
    else delete tokens[property];
    set({ tokens });
    // sessionStorage persistence (prd-web.md 3.5 still honored: never
    // localStorage, never a shared disk cache — one tab, one scope, wiped
    // at tab close). Live-caught on the Freebuff preview: a full page load
    // (mobile nav or refresh) used to drop the pasted token and flash the
    // login gate. The raw vguest_ value is carried because the tab IS the
    // device boundary here; the server-side bind (account session) stays
    // the stronger path when email/OTP is configured.
    try {
      if (token) {
        sessionStorage.setItem("bolete-token-" + property, token);
      } else {
        sessionStorage.removeItem("bolete-token-" + property);
      }
    } catch { /* private mode: memory-only, the pre-fix behavior */ }
  },
  /** rehydrate the pasted token(s) for THIS tab from sessionStorage.
   *  Called once on AuthGate mount BEFORE the session probe; a token
   *  found here short-circuits the gate the same way a memory token does. */
  restoreToken(property: string) {
    try {
      const saved = sessionStorage.getItem("bolete-token-" + property);
      if (saved && saved.startsWith("vguest_") && !state.tokens[property]) {
        set({ tokens: { ...state.tokens, [property]: saved } });
      }
    } catch { /* private mode: memory-only */ }
  },
  /** (P6b) restore the pairwise-bound e2e channel key for THIS tab — the
   *  same one-tab scope as the pasted token, wiped with it on sign-out. */
  restoreChannelKey(property: string) {
    try {
      const saved = sessionStorage.getItem("bolete-ck-" + property);
      if (saved && saved.length >= 32 && !state.channelKeys[property]) {
        set({ channelKeys: { ...state.channelKeys, [property]: saved } });
      }
    } catch { /* private mode: memory-only */ }
  },
  /** (P6b, the binding moment's client half) the redeem reply delivered
   *  the RAW e2e channelKey exactly once — bind it into the sovereign
   *  profile HERE, the only surface that ever holds it client-side. */
  bindChannelKey(property: string, key: string) {
    if (!key || key.length < 32) return;
    set({ channelKeys: { ...state.channelKeys, [property]: key } });
    try {
      sessionStorage.setItem("bolete-ck-" + property, key);
    } catch { /* private mode: memory-only */ }
  },
  unbindChannelKey(property: string) {
    const keys = { ...state.channelKeys };
    delete keys[property];
    set({ channelKeys: keys });
    try {
      sessionStorage.removeItem("bolete-ck-" + property);
    } catch { /* private mode: nothing to wipe */ }
  },
  /** the honest ROUTE RECORD from the last door call (memory-only). */
  markRoute(route: string | null) {
    set({ lastRoute: route });
  },
  /** add a verified hop (its caps verdict arrived from the origin's own
   *  PUBLIC capabilities page in api.relayCaps — a record, not a guess). */
  addHop(caps: { origin: string; flavor: string; e2e: string }): void {
    if (!/^https:\/\//.test(caps.origin) || state.chain.some((h) => h.origin === caps.origin)) return;
    const hop: ChainHop = {
      id: "hop-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
      origin: caps.origin,
      flavor: caps.flavor,
      e2e: caps.e2e,
      added: Date.now(),
    };
    const chain = [...state.chain, hop];
    set({ chain });
    try {
      localStorage.setItem("bolete-chain", JSON.stringify(chain));
    } catch { /* private mode: session-only chain */ }
  },
  removeHop(id: string) {
    const chain = state.chain.filter((h) => h.id !== id);
    set({ chain });
    try {
      localStorage.setItem("bolete-chain", JSON.stringify(chain));
    } catch { /* private mode: session-only chain */ }
  },
  moveHop(id: string, dir: -1 | 1) {
    const i = state.chain.findIndex((h) => h.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.chain.length) return;
    const chain = [...state.chain];
    const [moved] = chain.splice(i, 1);
    chain.splice(j, 0, moved);
    set({ chain });
    try {
      localStorage.setItem("bolete-chain", JSON.stringify(chain));
    } catch { /* private mode: session-only chain */ }
  },
  setTheme(theme: AppState["theme"]) {
    set({ theme });
    try {
      localStorage.setItem("bolete-theme", theme);
    } catch { /* private mode: session-only preference */ }
  },
  toggleHelp(on: boolean) {
    set({ help: on });
    try {
      localStorage.setItem("bolete-help", on ? "1" : "0");
    } catch { /* private mode: session-only preference */ }
  },
  /** the web/relay endpoint this dashboard RUNS WITH (owner's corrected
   *  arc: dashboard uses /web/relay, pass 233). Non-sensitive origin
   *  URL; verified live against the relay's public caps on entry. */
  setRelayEndpoint(url: string) {
    set({ relayEndpoint: url });
    try {
      localStorage.setItem("bolete-relay-endpoint", url);
    } catch { /* private mode: session-only preference */ }
  },
  /** the user's reach-my-pod-through-relays choice (persisted non-sensitive
   *  pref; prd-relay.md 6.1 - the usage side of the two-sided contract) */
  setRelayUsage(on: boolean) {
    set({ relayUsage: on });
    try {
      localStorage.setItem("bolete-relay-usage", on ? "1" : "0");
    } catch { /* private mode: session-only preference */ }
  },
  /** switching context preserves the route; the caller updates ?p= */
  switchProperty(id: string) {
    set({ property: id });
  },
  /** re-read ?p= after route changes (frame calls this on navigation) */
  switchPropertyFromUrl() {
    const fromUrl = readPropertyFromUrl();
    if (fromUrl !== state.property) set({ property: fromUrl });
  },
  /** account session probed/verified (P2; the server owns the truth) */
  setAccount(account: { role: DashRole }, boundFor: string[]) {
    set({ account, boundFor });
  },
  markBound(property: string) {
    if (state.account && !state.boundFor.includes(property)) {
      set({ boundFor: [...state.boundFor, property] });
    }
  },
  /** sign out: clear the account session AND pasted tokens (memory
    *  AND the sessionStorage copies — a stale saved token must never
    *  resurrect a signed-out tab: the rehydrate would beat the empty
    *  probe). Keys are wiped by suffix so every property clears. */
  clearAccount() {
    set({ account: null, boundFor: [], tokens: {}, channelKeys: {} });
    try {
      const kill: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        // the e2e channel keys share the token's scope: signed out = gone
        if (k && (k.startsWith("bolete-token-") || k.startsWith("bolete-ck-"))) kill.push(k);
      }
      for (const k of kill) sessionStorage.removeItem(k);
    } catch { /* private mode: nothing to wipe */ }
  },
};

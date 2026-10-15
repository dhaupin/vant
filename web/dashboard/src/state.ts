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
};

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
    set({ account: null, boundFor: [], tokens: {} });
    try {
      const kill: string[] = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith("bolete-token-")) kill.push(k);
      }
      for (const k of kill) sessionStorage.removeItem(k);
    } catch { /* private mode: nothing to wipe */ }
  },
};

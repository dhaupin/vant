import { useSyncExternalStore } from "react";

/**
 * The frontend's own state, keyed per attached property (prd-web.md 3.4).
 * Tokens live in MEMORY ONLY (MVP paste; worker-side session binding is
 * the P2 upgrade - prd-web.md 3.5). Nothing here touches localStorage
 * except non-sensitive UI prefs (theme, help visibility).
 */

export type Tier = "O" | "H" | "A" | "S";

export interface AppState {
  /** one pasted vguest_ token per property id (never persisted) */
  tokens: Record<string, string>;
  /** URL ride-along property id (prd-web.md 3.4); default single property */
  property: string;
  theme: "light" | "dark" | "system";
  help: boolean;
}

const listeners = new Set<() => void>();
let state: AppState = {
  tokens: {},
  property: readPropertyFromUrl(),
  theme: (readRawPref("bolete-theme") as AppState["theme"] | null) ?? "system",
  help: readRawPref("bolete-help") !== "0",
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
  /** switching context preserves the route; the caller updates ?p= */
  switchProperty(id: string) {
    set({ property: id });
  },
  /** re-read ?p= after route changes (frame calls this on navigation) */
  switchPropertyFromUrl() {
    const fromUrl = readPropertyFromUrl();
    if (fromUrl !== state.property) set({ property: fromUrl });
  },
};

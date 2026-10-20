/**
 * THE SOVEREIGN PROFILE TRANSPORT (prd-relay.md §2.2, web-scale rung —
 * client-held, encrypted, portable).
 *
 * The instance profile — the relay chain, the bound e2e channel keys, the
 * pod guest identities (memory/crypto-held, never a relay surface) and
 * the user's reach preference — moves between devices as ONE encrypted
 * file (`bolete-profile.enc`; the horcrux pattern, web scale).
 *
 * THE KEK IS THE DOCUMENTED UNLOCK PATH (a): a passphrase-derived key
 * through the SAME Encrypt canon the e2e channel rides (PBKDF2-SHA256,
 * 100k iterations, AES-256-GCM, salt:iv:tag:cipher hex). No passphrase —
 * and nothing under it — ever crosses the wire: the bytes are sealed
 * client-side and open client-side only. Unlock path (b) (passkey/
 * WebAuthn PRF) is a later rung and deliberately absent here.
 */

import { sealEnvelope, openEnvelope } from "./seal";

const FRAGMENT_PREFIX = "vprof-1:"; // the fragment envelope marks its version in the PREFIX, not inside the cipher
const MIN_PASSPHRASE = 8;
export const PROFILE_FILENAME = "bolete-profile.enc";

export interface SovereignProfile {
  v: number;
  kind: "bolete-profile";
  exported: number;
  /** the user's chain, order preserved (prd-relay.md 3.3) */
  chain: Array<{ id: string; origin: string; flavor: string; e2e: string; added?: number }>;
  /** the pairwise-bound e2e channel keys (per property) */
  channelKeys: Record<string, string>;
  /** the pod guest identities — memory/crypto-held, riding INSIDE the seal only */
  tokens: Record<string, string>;
  /** the user's reach choice (prd-relay.md 6.1) */
  relayUsage?: boolean;
}

function assertPassphrase(passphrase: string): string {
  if (typeof passphrase !== "string" || passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`E_PROFILE_KEY: a passphrase must be ${MIN_PASSPHRASE}+ chars — it is the only kek this profile has`);
  }
  return passphrase;
}

/** shape law: the DECRYPTED payload must be this version's profile, or refuse. */
function assertProfileShape(raw: string): SovereignProfile {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("E_PROFILE_SHAPE: the decrypted payload was not JSON"); }
  const p = parsed as SovereignProfile;
  if (!p || typeof p !== "object" || p.kind !== "bolete-profile") {
    throw new Error("E_PROFILE_SHAPE: not a bolete profile (kind refused, never guessed)");
  }
  if (p.v !== 1) {
    throw new Error(`E_PROFILE_SHAPE: profile version ${String(p.v)} is not this client's law (v1) — refusing, no downgrade`);
  }
  if (typeof p.tokens !== "object" || typeof p.channelKeys !== "object" || !Array.isArray(p.chain)) {
    throw new Error("E_PROFILE_SHAPE: the profile lacks its chain/keys/identity blocks");
  }
  for (const [k, tk] of Object.entries(p.tokens)) {
    if (typeof tk !== "string" || !tk.startsWith("vguest_")) {
      throw new Error(`E_PROFILE_SHAPE: an identity inside the profile is not a vguest_ token (property ${k})`);
    }
  }
  for (const [k, ck] of Object.entries(p.channelKeys)) {
    if (typeof ck !== "string" || ck.length < 32) {
      throw new Error(`E_PROFILE_SHAPE: a channel key inside the profile is under 32 chars (property ${k})`);
    }
  }
  for (const hop of p.chain) {
    if (!hop || typeof hop.origin !== "string" || !/^https:\/\//.test(hop.origin)) {
      throw new Error("E_PROFILE_SHAPE: a chain entry is not an https origin");
    }
  }
  return p;
}

/**
 * Export the profile tab-state into ONE passphrase-sealed file body.
 * Everything sensitive rides INSIDE the seal; the returned text is the
 * whole artifact (prefix + envelope) — write it to `bolete-profile.enc`.
 */
export async function exportProfile(
  assets: { chain: SovereignProfile["chain"]; channelKeys: Record<string, string>; tokens: Record<string, string>; relayUsage?: boolean },
  passphrase: string,
): Promise<{ filename: string; text: string }> {
  const key = assertPassphrase(passphrase);
  const profile: SovereignProfile = {
    v: 1,
    kind: "bolete-profile",
    exported: Date.now(),
    chain: assets.chain,
    channelKeys: assets.channelKeys,
    tokens: assets.tokens,
    relayUsage: assets.relayUsage,
  };
  // the KEK floor is the profile's own law: 8+ chars (§2.2 unlock path (a))
  const envelope = await sealEnvelope(JSON.stringify(profile), key, { minLen: 8, what: "passphrase" });
  return { filename: PROFILE_FILENAME, text: FRAGMENT_PREFIX + envelope };
}

/**
 * Import a profile fragment: prefix-typed, passphrase-opened, shape-
 * verified. Returns the PROFILE — the caller performs the MERGE (never
 * clobbering what this tab already holds; §2.2: from first import on,
 * the profile is the user's). A wrong passphrase opens to nothing and
 * refuses typed.
 */
export async function importProfile(text: string, passphrase: string): Promise<SovereignProfile> {
  const key = assertPassphrase(passphrase);
  const body = (typeof text === "string" ? text.trim() : "");
  if (!body.startsWith(FRAGMENT_PREFIX) ) {
    throw new Error(`E_PROFILE_SHAPE: not a profile fragment (expected the ${FRAGMENT_PREFIX}* envelope) — refusing, never guessing`);
  }
  let opened: string;
  try {
    opened = await openEnvelope(body.slice(FRAGMENT_PREFIX.length), key, { minLen: 8, what: "passphrase" });
  } catch (e) {
    const why = e instanceof Error ? e.message : "would not open";
    if (why.includes("wrong key")) {
      throw new Error("E_PROFILE_KEY: the passphrase does not open this profile (wrong or corrupted data)");
    }
    throw new Error("E_PROFILE_SHAPE: " + why);
  }
  return assertProfileShape(opened);
}

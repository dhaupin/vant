/**
 * THE SOVEREIGN PROFILE STORE (prd-relay.md §2.2, the STORAGE rung —
 * client-held AT REST, not just per-tab memory).
 *
 * The instance profile is sealed with a DEVICE KEY that is
 * NON-EXTRACTABLE (`extractable: false` CryptoKey, structured-clone
 * stored in IndexedDB): a page can USE it, never export it — the unlock
 * is possession of the device itself. TWO documented unlock lanes exist
 * in the spec: (a) the passphrase KEK (the export/import transport,
 * lib/profile.ts) and (b) a WebAuthn PRF-derived KEK (guarded below).
 * No passphrase, PRF assertion, or key material ever crosses the wire;
 * everything here is sealed/opened client-side and the record lives in
 * IndexedDB (the horcux pattern, web scale).
 *
 * ENVELOPE LAW: the at-rest record keeps the Encrypt-canon SHAPE
 * (salt:iv:tag:cipher hex) but SKIPS the PBKDF2 — the device key IS the
 * 32-byte AES key already (nothing derives, nothing exports). The
 * transport layer is INJECTABLE (IndexedDB browser lane, memory KV for
 * the pinned tests); the store refuses to operate without a KV.
 */

import type { SovereignProfile } from "./profile";

const DB_NAME = "bolete-sovereign";
const STORE_NAME = "profile";
const RECORD_ID = "instance-profile";
const DEVICE_KEY_ID = "device-key";
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Minimal KV the store runs on (IndexedDB in the browser, memory in tests). */
export interface ProfileKV {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/** The profile record as it sits at rest: sealed to the device key. */
export interface StoredProfile {
  sealedAt: number;
  ct: string; // salt:iv:tag:cipher hex — the canon shape, device-key direct
}

function assertStored(raw: unknown): StoredProfile {
  const r = raw as StoredProfile;
  if (!r || typeof r !== "object" || typeof r.ct !== "string" || typeof r.sealedAt !== "number") {
    throw new Error("E_PROFILE_STORE: the device profile record is not a stored profile — refusing to open");
  }
  return r;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("E_PROFILE_STORE: odd hex field");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const v = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(v)) throw new Error("E_PROFILE_STORE: non-hex byte");
    out[i] = v;
  }
  return out;
}

/** Open the browser's IndexedDB KV (guarded; typed refusals on failure). */
export function indexeddbKV(): ProfileKV {
  let idb: IDBFactory | null = null;
  try { idb = globalThis.indexedDB ?? null; } catch { idb = null; }
  if (!idb) throw new Error("E_PROFILE_STORE: IndexedDB is unavailable in this context (the device lane needs a browser)");
  const withDb = (mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const open = idb!.open(DB_NAME, 1);
      open.onupgradeneeded = () => { open.result.createObjectStore(STORE_NAME); };
      open.onerror = () => reject(new Error("E_PROFILE_STORE: the device store would not open"));
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE_NAME, mode);
        const req = run(tx.objectStore(STORE_NAME));
        req.onsuccess = () => resolve(mode === "readonly" ? (req.result ?? null) : undefined);
        req.onerror = () => reject(new Error("E_PROFILE_STORE: store operation refused"));
      };
    });
  return {
    get: (key) => withDb("readonly", (store) => store.get(key)),
    put: async (key, value) => { await withDb("readwrite", (store) => store.put(value, key) as IDBRequest); },
    delete: async (key) => { await withDb("readwrite", (store) => store.delete(key) as IDBRequest); },
  };
}

/** In-memory KV — the same interface, for the pinned law tests. */
export function memoryKV(): ProfileKV & { dump: () => Map<string, unknown> } {
  const rows = new Map<string, unknown>();
  return {
    get: async (k) => rows.get(k) ?? null,
    put: async (k, v) => { rows.set(k, v); },
    delete: async (k) => { rows.delete(k); },
    dump: () => rows,
  };
}

/**
 * THE DEVICE KEY — `extractable: false`: no page, script, or export path
 * can carry it out (structured-clone stored in the KV; usage-only).
 */
async function deviceKey(kv: ProfileKV, mode: "encrypt" | "decrypt"): Promise<CryptoKey> {
  const stored = (await kv.get(DEVICE_KEY_ID)) as CryptoKey | null;
  if (!stored) {
    if (mode === "decrypt") throw new Error("E_PROFILE_STORE: no profile is stored on this device yet");
    if (!crypto?.subtle) throw new Error("E_PROFILE_STORE: WebCrypto subtle is unavailable in this context");
    const generated = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      false,                    // NON-EXTRACTABLE — the whole point (§2.2)
      ["encrypt", "decrypt"],
    );
    await kv.put(DEVICE_KEY_ID, generated);
    return generated;
  }
  if (!stored || stored.type !== "secret") {
    throw new Error("E_PROFILE_STORE: the stored device key is not a usable key");
  }
  const uses = stored.usages ?? ([] as KeyUsage[]);
  if (!uses.includes(mode)) {
    throw new Error(`E_PROFILE_STORE: the stored device key cannot ${mode} (usages: ${uses.join(",")})`);
  }
  return stored;
}

/** AES-GCM straight on the CryptoKey, into the canon SHAPE. */
async function sealWithKey(key: CryptoKey, plaintext: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 }, key, enc.encode(plaintext)));
  const tagStart = sealed.length - TAG_BYTES;
  return toHex(salt) + ":" + toHex(iv) + ":" + toHex(sealed.slice(tagStart)) + ":" + toHex(sealed.slice(0, tagStart));
}

async function openWithKey(key: CryptoKey, ct: string): Promise<string> {
  const parts = ct.split(":");
  if (parts.length !== 4) throw new Error("E_PROFILE_STORE: invalid record format");
  const iv = fromHex(parts[1]);
  if (iv.length !== IV_BYTES && iv.length !== 16) throw new Error("E_PROFILE_STORE: unsupported IV length — not a Vant record");
  const body = new Uint8Array([...fromHex(parts[3]), ...fromHex(parts[2])]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 }, key, body as unknown as BufferSource);
  return new TextDecoder().decode(plain);
}

/** Seal the profile to the device key (non-extractable) and store it. */
export async function storeProfileOnDevice(kv: ProfileKV, profile: SovereignProfile): Promise<void> {
  const key = await deviceKey(kv, "encrypt");
  if (!crypto?.subtle) throw new Error("E_PROFILE_STORE: WebCrypto subtle is unavailable in this context");
  const ct = await sealWithKey(key, JSON.stringify(profile));
  await kv.put(RECORD_ID, { sealedAt: Date.now(), ct } satisfies StoredProfile);
}

/** Load and open the stored profile (device possession = the unlock). */
export async function loadProfileFromDevice(kv: ProfileKV): Promise<SovereignProfile | null> {
  const raw = await kv.get(RECORD_ID);
  if (!raw) return null;
  const rec = assertStored(raw);
  const key = await deviceKey(kv, "decrypt");
  let opened: string;
  try {
    opened = await openWithKey(key, rec.ct);
  } catch {
    throw new Error("E_PROFILE_STORE: the stored profile would not open with this device's key (the store was reset, or the record was tampered)");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(opened); } catch { throw new Error("E_PROFILE_STORE: the stored profile payload was not JSON"); }
  const p = parsed as SovereignProfile;
  if (!p || p.kind !== "bolete-profile") {
    throw new Error("E_PROFILE_STORE: the stored payload is not a bolete profile");
  }
  return p;
}

/** Forget THIS device's copy entirely (the user's explicit housekeeping). */
export async function wipeDeviceProfile(kv: ProfileKV): Promise<void> {
  await kv.delete(RECORD_ID);
  await kv.delete(DEVICE_KEY_ID);
}

// -- unlock lane (b): WebAuthn PRF -----------------------------------------
/**
 * The PRF lane derives a KEK from a passkey assertion's PRF extension
 * output. Honesty over optimism in ONE law: this lane refuses TYPED when
 * the platform cannot serve PRF — never a fake unlock. A real derivation
 * needs the browser's `prfResults` bytes from navigator.credentials.get(),
 * which then key the SAME canon (see the shape in unlockWithPrf).
 */
export function prfAvailable(): boolean {
  try {
    const nav = globalThis.navigator as Navigator | undefined;
    return !!(nav && "credentials" in nav && (nav as Navigator).credentials);
  } catch {
    return false;
  }
}

/**
 * PRF attempt against a REAL credentials.get() call for a stored
 * credential id. Without WebAuthn this refuses TYPED before any wire;
 * with WebAuthn the returned PRF bytes key the canon seal. The sealed
 * record holder is a caller callback (the device lane's PRF-sealed
 * record is bound to the credential id that produced it).
 */
export async function unlockWithPrf(opts: {
  credentialId: Uint8Array;
  challenge: Uint8Array;
  /** a fixed PRF 'first' salt — the deterministic derivation this
   *  binding's record was sealed under (bind half stores it in the clear) */
  prfEvalFirst?: Uint8Array;
  loadSealedByPrf?: (prf: Uint8Array) => Promise<string | null>;
}): Promise<SovereignProfile> {
  if (!prfAvailable()) {
    throw new Error("E_PROFILE_PRF: WebAuthn is unavailable in this context — unlock path (b) needs a browser with passkeys");
  }
  const nav = (globalThis.navigator as Navigator) as Navigator & {
    credentials: { get: (o: unknown) => Promise<unknown> };
  };
  const cred = (await nav.credentials.get({
    publicKey: {
      challenge: opts.challenge as unknown as BufferSource,
      allowCredentials: [{ id: opts.credentialId as unknown as BufferSource }],
      userVerification: "required",
      extensions: { prf: opts.prfEvalFirst ? { eval: { first: opts.prfEvalFirst as unknown as BufferSource } } : {} },
    },
  })) as { getClientExtensionResults?: () => { prfResults?: ArrayBuffer[] } };
  const ext = cred && cred.getClientExtensionResults ? cred.getClientExtensionResults() : null;
  const prf = ext?.prfResults?.[0];
  if (!prf) {
    throw new Error("E_PROFILE_PRF: the authenticator returned no PRF output — it cannot serve unlock path (b)");
  }
  if (!opts.loadSealedByPrf) {
    throw new Error("E_PROFILE_PRF: no PRF-sealed record is bound to this device");
  }
  const sealed = await opts.loadSealedByPrf(new Uint8Array(prf));
  if (!sealed) throw new Error("E_PROFILE_PRF: no record was stored under this passkey's PRF yet");
  const kek = "prf:" + toHex(new Uint8Array(prf));
  let opened: string;
  try {
    const { openEnvelope } = await import("./seal");
    opened = await openEnvelope(sealed, kek, { minLen: 1, what: "prf kek" });
  } catch (e) {
    throw new Error("E_PROFILE_PRF: the PRF-sealed record " + (e instanceof Error ? e.message : "would not open"));
  }
  let parsed: unknown;
  try { parsed = JSON.parse(opened); } catch { throw new Error("E_PROFILE_PRF: the PRF-opened payload was not JSON"); }
  const p = parsed as SovereignProfile;
  if (!p || p.kind !== "bolete-profile") throw new Error("E_PROFILE_PRF: the PRF-opened payload is not a bolete profile");
  return p;
}

// -- unlock lane (b), the BIND half: a real stored PRF seal -----------------

const PRF_RECORD_ID = "prf-binding";

/**
 * The stored PRF binding: the passkey credential id + the FIXED eval salt
 * live in the CLEAR (ids and salts are non-secret by WebAuthn design —
 * the salt alone produces NO key material without the credential's
 * private key); the profile itself stays SEALED under the PRF KEK.
 */
export interface StoredPrfBinding {
  kind: "bolete-prf-binding";
  boundAt: number;
  /** base64url of the credential id (the unlock seek key) */
  credentialId: string;
  /** hex of the PRF 'first' eval salt — deterministic, non-secret */
  salt: string;
  /** base64url label of the credential's user id */
  userId: string;
  /** the profile sealed to the PRF KEK (Encrypt-canon shape) */
  ct: string;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? s : s + "=".repeat(4 - (s.length % 4));
  const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function webauthn(): Navigator & { credentials: { get: (o: unknown) => Promise<unknown>; create?: (o: unknown) => Promise<unknown> } } {
  const nav = globalThis.navigator as Navigator;
  if (!nav || !("credentials" in nav)) {
    throw new Error("E_PROFILE_PRF: WebAuthn is unavailable in this context — unlock path (b) needs a browser with passkeys");
  }
  if (!crypto?.subtle) {
    throw new Error("E_PROFILE_PRF: WebCrypto subtle is unavailable in this context");
  }
  return nav as unknown as ReturnType<typeof webauthn>;
}

/**
 * The REAL PRF derivation: a passkey assertion against the credential id
 * with the prf extension's eval salt. PRF output is deterministic on
 * (credential secret × salt) — the same salt always yields the same KEK,
 * so the stored seal opens on every assert, and NOTHING derivable exists
 * without the authenticator's private key material.
 */
async function prfDerivation(credentialId: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const nav = webauthn();
  const cred = (await nav.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)) as unknown as BufferSource,
      allowCredentials: [{ id: credentialId as unknown as BufferSource }],
      userVerification: "required",
      extensions: { prf: { eval: { first: salt as unknown as BufferSource } } },
    },
  })) as { getClientExtensionResults?: () => { prfResults?: ArrayBuffer[] } };
  const ext = cred && cred.getClientExtensionResults ? cred.getClientExtensionResults() : null;
  const prf = ext?.prfResults?.[0];
  if (!prf) {
    throw new Error("E_PROFILE_PRF: the authenticator returned no PRF output — it cannot serve unlock path (b)");
  }
  return new Uint8Array(prf);
}

/**
 * THE BIND HALF (the rung the settings surface named 'a later rung'):
 * create a PRF-capable passkey, derive the KEK from a FIXED salt, seal
 * the sovereign profile to it, and store the binding (clear ids + salt,
 * sealed ct) beside the device lane. Nothing secret is stored in the
 * clear — the binding record's only secret lives inside the ct.
 */
export async function bindPrfProfile(
  kv: ProfileKV,
  profile: SovereignProfile,
  opts: { name?: string; displayName?: string } = {},
): Promise<StoredPrfBinding> {
  const nav = webauthn();
  if (typeof nav.credentials.create !== "function") {
    throw new Error("E_PROFILE_PRF: passkey creation is unavailable in this context");
  }
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const username = opts.name ?? ("bolete-sovereign-" + Date.now().toString(36));
  const cred = (await nav.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)) as unknown as BufferSource,
      rp: { name: "Vant sovereign profile lock" },
      user: {
        id: userId as unknown as BufferSource,
        name: username,
        displayName: opts.displayName ?? "Sovereign profile key",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { userVerification: "required" },
      extensions: { prf: {} },
    },
  })) as { rawId?: ArrayBuffer };
  if (!cred || !cred.rawId) {
    throw new Error("E_PROFILE_PRF: the passkey creation refused (the browser or platform cancelled the request)");
  }
  const credentialId = new Uint8Array(cred.rawId);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  let prf: Uint8Array;
  try {
    prf = await prfDerivation(credentialId, salt);
  } catch (e) {
    throw new Error("E_PROFILE_PRF: the created passkey cannot serve PRF on this platform — " + (e instanceof Error ? e.message : "no output"));
  }
  const kek = "prf:" + toHex(prf);
  const { sealEnvelope } = await import("./seal");
  const ct = await sealEnvelope(JSON.stringify(profile), kek, { minLen: 1, what: "prf kek" });
  const binding: StoredPrfBinding = {
    kind: "bolete-prf-binding",
    boundAt: Date.now(),
    credentialId: b64url(credentialId),
    salt: toHex(salt),
    userId: b64url(userId),
    ct,
  };
  await kv.put(PRF_RECORD_ID, binding);
  return binding;
}

/** Read the stored binding record honestly (null = none bound yet). */
export async function readPrfBinding(kv: ProfileKV): Promise<StoredPrfBinding | null> {
  const raw = await kv.get(PRF_RECORD_ID);
  if (!raw) return null;
  const b = raw as StoredPrfBinding;
  if (!b || typeof b !== "object" || b.kind !== "bolete-prf-binding" || typeof b.ct !== "string"
    || typeof b.credentialId !== "string" || typeof b.salt !== "string") {
    throw new Error("E_PROFILE_PRF: the stored PRF binding is not a binding record — refusing to open");
  }
  return b;
}

/**
 * UNLOCK LANE (b) FOR REAL: assert the stored credential, derive the SAME
 * KEK from the stored salt, and open the sealed profile. A wrong or stale
 * authenticator (a copy of the record without the passkey's key material)
 * can NEVER derive the KEK — the honest failure story, typed.
 */
export async function loadProfileFromPrfDevice(kv: ProfileKV): Promise<SovereignProfile | null> {
  const binding = await readPrfBinding(kv);
  if (!binding) return null;
  const prf = await prfDerivation(fromB64url(binding.credentialId), fromHex(binding.salt));
  const kek = "prf:" + toHex(prf);
  let opened: string;
  try {
    const { openEnvelope } = await import("./seal");
    opened = await openEnvelope(binding.ct, kek, { minLen: 1, what: "prf kek" });
  } catch (e) {
    throw new Error("E_PROFILE_PRF: the PRF-sealed record " + (e instanceof Error ? e.message : "would not open"));
  }
  let parsed: unknown;
  try { parsed = JSON.parse(opened); } catch { throw new Error("E_PROFILE_PRF: the PRF-opened payload was not JSON"); }
  const p = parsed as SovereignProfile;
  if (!p || p.kind !== "bolete-profile") throw new Error("E_PROFILE_PRF: the PRF-opened payload is not a bolete profile");
  return p;
}

/** Forget the PRF binding record (the credential itself is browser-held). */
export async function forgetPrfBinding(kv: ProfileKV): Promise<void> {
  await kv.delete(PRF_RECORD_ID);
}

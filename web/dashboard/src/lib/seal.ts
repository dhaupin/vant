/**
 * THE E2E CHANNEL (prd-relay.md §5, P6b rung — client half).
 *
 * The paired sovereign client seals its door call and opens the pod's
 * re-sealed answer with the channel key it received at the BINDING moment
 * (pairing_voucher_redeem — the one-time reply, never readable from any
 * door or caps surface afterwards). Bytes are EXACTLY the pod's Encrypt
 * canon (lib/encrypt.js): PBKDF2-SHA256(key, salt, 100_000, 32 B) →
 * AES-256-GCM, modern 12-byte IV, envelope `salt:iv:tag:cipher` as hex.
 * A pod that never added this width accepts a browser-sealed ride by
 * construction — and a browser opens a pod-sealed envelope with the same
 * width-sniffing law (24 or 32 hex IV chars, never a guess).
 */

const PBKDF2_ITERATIONS = 100_000;
const KEY_LEN_BITS = 256;
const SALT_BYTES = 16; // 32 hex chars
const IV_BYTES = 12; // 24 hex chars — the modern (stegoframe-aligned) nonce
const TAG_BYTES = 16; // GCM auth tag, 32 hex chars

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("odd hex field");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const v = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(v)) throw new Error("non-hex byte");
    out[i] = v;
  }
  return out;
}

function assertKey(key: string): string {
  if (typeof key !== "string" || key.length < 32) {
    throw new Error("the channel key must be 32+ chars (the binding moment's law)");
  }
  return key;
}

async function deriveKey(key: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(assertKey(key)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: KEY_LEN_BITS },
    false,
    usages,
  );
}

/**
 * Seal plaintext into the Encrypt canon envelope. WebCrypto's AES-GCM
 * result is cipher||tag concatenated, so the last 16 bytes are split off
 * as the tag field — the pod's canon keeps them separate.
 */
export async function sealEnvelope(plaintext: string, key: string): Promise<string> {
  if (!crypto?.subtle) throw new Error("WebCrypto subtle is unavailable in this context");
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const der = await deriveKey(key, salt, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource, tagLength: 128 }, der, enc.encode(plaintext)));
  const tagStart = sealed.length - TAG_BYTES;
  const cipher = sealed.slice(0, tagStart);
  const tag = sealed.slice(tagStart);
  return toHex(salt) + ":" + toHex(iv) + ":" + toHex(tag) + ":" + toHex(cipher);
}

/**
 * Open an Encrypt-canon envelope back to plaintext. The IV width is the
 * version marker (24 hex = modern 12 B, 32 = legacy 16 B) — identical to
 * the pod's decrypt() law; anything else is not a Vant record and refuses
 * instead of guessing.
 */
export async function openEnvelope(ct: string, key: string): Promise<string> {
  if (!crypto?.subtle) throw new Error("WebCrypto subtle is unavailable in this context");
  const parts = (typeof ct === "string" ? ct : "").split(":");
  if (parts.length !== 4) throw new Error("invalid cipher format (expected salt:iv:authTag:encrypted)");
  const salt = fromHex(parts[0]);
  const ivHex = parts[1];
  // the pod's decrypt() width sniff: 24 hex = 12 B modern, 32 = 16 B legacy
  if (ivHex.length !== IV_BYTES * 2 && ivHex.length !== 32) {
    throw new Error(`unsupported IV length (${ivHex.length / 2}B) — not a Vant/stegoframe record`);
  }
  // WebCrypto wants cipher||tag concatenated; the canon fields are split.
  const body = new Uint8Array([...fromHex(parts[3]), ...fromHex(parts[2])]);
  let der: CryptoKey;
  try {
    der = await deriveKey(key, salt, ["decrypt"]);
  } catch {
    throw new Error("decryption failed - wrong key or corrupted data");
  }
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(ivHex) as unknown as BufferSource, tagLength: 128 }, der, body as unknown as BufferSource);
    return new TextDecoder().decode(plain);
  } catch {
    // the pod's law: wrong key or corrupted data is the ONLY failure story
    throw new Error("decryption failed - wrong key or corrupted data");
  }
}

/**
 * Provider mode (prd-provider-mode.md, PM1 rung): the community face's
 * posture resolver. THIS module owns the provider env-key law - the
 * vendored relay contract (relay-contract.cjs, checksummed) stays
 * untouched because provider adds NOTHING to the r/2 wire; the caps
 * line it produces is merged at the route after capsShape returns.
 *
 * The keys (all PAGES SETTINGS, DEPLOY.md section 12.5; values read at
 * REQUEST time, never code strings - prd-web.md 3.7):
 *   VANT_RELAY_PROVIDER_MODE            "1" | "true"  = the ONLY posture key
 *   VANT_RELAY_PROVIDER_SLOTS           install-wide live-slot ceiling (default 32)
 *   VANT_RELAY_PROVIDER_SLOTS_PER_USER  per-account ceiling (default 1)
 *   VANT_RELAY_PROVIDER_GRACE_HOURS     reap grace (default 48 - ruling 15;
 *                                       the KV row rewrite gates to 12h, so
 *                                       48h tolerates 4 missed windows)
 * plus the co-requisite binding: slot/registration state rides the
 * BOLETE_KV namespace (kv.ts). Gate ON + binding OFF is an HONEST middle:
 * caps still say offering, but the store face answers the typed
 * E-store refusal - never a silent dead surface.
 *
 * OFF posture (mode absent): postureOf() yields offering=false and the
 * caps line is OMITTED ENTIRELY - the response bytes match the
 * provider-never-existed shape (PM1's byte-identical acceptance).
 */

/** The provider env keys, in one place so audits can walk them. */
export const PROVIDER_ENV_KEYS = {
    mode: "VANT_RELAY_PROVIDER_MODE",
    slots: "VANT_RELAY_PROVIDER_SLOTS",
    slotsPerUser: "VANT_RELAY_PROVIDER_SLOTS_PER_USER",
    graceHours: "VANT_RELAY_PROVIDER_GRACE_HOURS",
    mailConnectors: "VANT_RELAY_MAIL_CONNECTORS",
    emailFrom: "EMAIL_FROM",
    emailAdminTo: "EMAIL_ADMIN_TO",
    purelymailUser: "PURELYMAIL_SMTP_USER",
    purelymailAppPassword: "PURELYMAIL_SMTP_APP_PASSWORD",
    /** (wave 19.16, owner) the operator email the deployment's admin
     *  account is pinned to (auth also reads it). Secret-or-text both
     *  work: it is hashed server-side, never echoed to a client. */
    adminAccount: "BOLETE_ADMIN_ACCOUNT",
    /** (wave 19.16, owner) the member-facing support mailbox rendered
     *  into verbose refusals (slot-full, disabled, privilege walls) and
     *  the caps provider line - JS-loaded, never baked into a static
     *  asset. Text var (it is mail-facing by design). */
    supportEmail: "EMAIL_SUPPORT",
} as const;

/** The provider component's shipped defaults (DEPLOY.md 12.5 rows). */
export const PROVIDER_DEFAULTS = {
    slots: 32,
    slotsPerUser: 1,
    graceHours: 48,
} as const;

export interface ProviderCapsLine {
    /** Always "offering" when present - the line only exists when ON. */
    posture: "offering";
    slots: number;
    slotsPerUser: number;
    graceHours: number;
    /** true when the BOLETE_KV binding is attach-shaped right now. */
    storeReady: boolean;
    /** The member support mailbox - present ONLY when EMAIL_SUPPORT is
     *  set (the key must be ABSENT, never null, when unset). */
    supportEmail?: string;
}

function envFlag(value: unknown): boolean {
    return value === "1" || value === "true";
}

/** Int-parse an env value; anything that is not a plain string of
 *  decimal digits (^\d+$, no sign/prefix/trailing junk) falls back to
 *  the default - a malformed var must not posture-gate the face (the
 *  PM1 pin caught parseInt("0x10",10) yielding 0, which a lenient
 *  parse would have turned into a 0h reap grace). */
function nonNegativeInt(value: unknown, fallback: number): number {
    if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : fallback;
}

/** Duck-check the KV binding the same way kv.ts's storeFor does, so the
 *  two readiness laws can never drift apart. */
export function providerStoreReady(env: Record<string, unknown>): boolean {
    const binding = env["BOLETE_KV"];
    if (!binding || typeof binding !== "object") return false;
    const ns = binding as Partial<{
        get: unknown;
        put: unknown;
        delete: unknown;
    }>;
    return (
        typeof ns.get === "function" &&
        typeof ns.put === "function" &&
        typeof ns.delete === "function"
    );
}

export interface ProviderPosture {
    offering: boolean;
    storeReady: boolean;
    caps: ProviderCapsLine | null;
}

/** Read the posture from a Pages env at request time (pure - the only
 *  thing the routes import; tests feed a plain object). */
export function providerPosture(env: Record<string, unknown>): ProviderPosture {
    const offering = envFlag(env[PROVIDER_ENV_KEYS.mode]);
    if (!offering) {
        // OFF posture: no line at all - omitting the key is the law
        // (byte-identical means the key is absent, not null).
        return { offering, storeReady: false, caps: null };
    }
    const caps: ProviderCapsLine = {
        posture: "offering",
        slots: nonNegativeInt(env[PROVIDER_ENV_KEYS.slots], PROVIDER_DEFAULTS.slots),
        slotsPerUser: nonNegativeInt(
            env[PROVIDER_ENV_KEYS.slotsPerUser],
            PROVIDER_DEFAULTS.slotsPerUser,
        ),
        graceHours: nonNegativeInt(
            env[PROVIDER_ENV_KEYS.graceHours],
            PROVIDER_DEFAULTS.graceHours,
        ),
        storeReady: providerStoreReady(env),
    };
    // supportEmail rides the caps only when actually set - the honesty
    // law again: an unset var is an ABSENT key, never an empty string.
    const support = env[PROVIDER_ENV_KEYS.supportEmail];
    if (typeof support === "string" && support.trim() && validEmailShapeLoose(support)) {
        caps.supportEmail = support.trim().toLowerCase();
    }
    return { offering, storeReady: caps.storeReady, caps };
}

/** Loose shape check for the support face - any string that at least
 *  contains an @ and a dot around it; stricter validation lives at the
 *  typed refusal render (a bad var must not posture-gate anything). */
function validEmailShapeLoose(value: string): boolean {
    const v = value.trim();
    return v.length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

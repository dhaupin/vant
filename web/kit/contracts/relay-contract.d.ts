/** Declaration for the vendored relay contract (web/kit source twin, r/2). */

export declare const CONTRACT_VERSION: string;
export declare const CAPS_VERSION: string;
export declare const WIRE_MAJOR: number;
export declare const SIGNATURE_HEADER: string;
export declare const SEALED: {
    readonly FIELD: "seal";
    readonly SIG_BYTES: "ct";
    readonly SIG_ALG: "HMAC-SHA256";
    readonly HEADERLESS: true;
    readonly REFUSES: { readonly BAD: 401; readonly STALE: 401; readonly REPLAY: 409 };
    readonly LAST_MILE: string;
};
export declare const ROUTES: { readonly relay: string };
export declare const EVENTS: {
    readonly hop: string;
    readonly ride: string;
    readonly sync: string;
    readonly lost: string;
    readonly call: string;
};
export declare const FLAVORS: {
    readonly POD: string;
    readonly DASHBOARD: string;
    readonly SOLO: string;
};
export declare const CODES: {
    readonly UNKNOWN_EVENT: string;
    readonly BAD_ORIGIN: string;
    readonly BAD_PATH: string;
    readonly NEEDS_ENVELOPE: string;
    readonly UPST: string;
    readonly RIDE_OFFLINE: string;
    readonly RIDE_DECODE: string;
    readonly RIDE_REPLAY: string;
    readonly RIDE_DISPATCH: string;
};
export declare const TRANSPORT_STATUS: {
    readonly UNAUTHENTICATED: number;
    readonly REPLAY: number;
    readonly NOT_FOUND: number;
    readonly TOO_LARGE: number;
};
export declare const ENVELOPE_RE_SOURCE: string;
export declare const ENVELOPE_MIN_LEN: number;
export declare const MAX_CTEXT: number;
export declare const HOP_TIMEOUT_MS: number;
export declare const RELAY_EVENTS: {
    readonly served: string;
    readonly rideServed: string;
    readonly mounted: string;
};
export declare const POD_CONFIG_KEYS: {
    readonly enabled: string;
    readonly gateKey: string;
    readonly channelKey: string;
    readonly allowPrivateOrigins: string;
};
export declare const EDGE_ENV_KEYS: {
    readonly enabled: string;
    readonly gateKey: string;
    readonly podOrigin: string;
};

export declare function envelopeShape(s: string): boolean;
export declare function wireEnvelope(
    event: string,
    payload: { origin: string; path: string; ct: string } | { ct: string },
    ts?: number,
    nonce?: string,
    from?: string
): {
    event: string;
    from: string;
    ts: number;
    nonce: string;
    payload: unknown;
    v: { major: number };
};
export declare function capsShape(
    flavor: string,
    gateReady: boolean,
    opts?: { e2e?: string; surface?: string[]; events?: string; posture?: string }
): {
    relay: string;
    flavor: string;
    gated: boolean;
    gateReady: boolean;
    e2e: string;
    surface: string[];
    events: string;
    posture: string;
};
export declare function isPrivateIp(ip: string): boolean;
export declare function isHardPrivateIp(ip: string): boolean;

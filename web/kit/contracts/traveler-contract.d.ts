/**
 * Type declarations for traveler-contract.js — the Traveler (enterprise
 * router object) contract, tr/1. Vendored beside relay-contract.d.cts.
 */

export declare const TRAVEL_VERSION: string;        // 'tr/1'
export declare const TRAVEL_WIRE_EVENT: string;     // 'relay.travel'
export declare const TRAVEL_MAX_CTEXT: number;      // 512 KiB state ceiling
export declare const TRAVEL_STEP_MAX: number;       // ledger ceiling per packet
export declare const TRAVEL_ID_RE_SOURCE: string;
export declare const TRAVEL_KNOWN: readonly string[];
export declare const TRAVEL_CODES: Readonly<{
    SHAPE: 'E_TRAVELER_SHAPE';
    SCHEMA: 'E_TRAVELER_SCHEMA';
    STEP: 'E_TRAVELER_STEP';
    ADDRESS: 'E_TRAVELER_ADDRESS';
}>;

export interface TravelerStep {
    seq: number;
    op: string;
    by?: string;
    ts?: number;
    [k: string]: unknown;
}

/** The enterprise router object: content-addressed, ledger-carried state. */
export interface Traveler {
    tr: string;                                     // 'tr/1' (| 'tr/0' legacy)
    id: string;                                     // opaque hex content address
    from: string;
    seq: number;                                    // frozen stamp == steps.length
    steps: TravelerStep[];
    slots: Record<string, unknown>;                 // opaque to every hop
    v: { major: number };
    rized?: { from: string; to: string };
}

/** Builder (pure): schema-stamped, envelope-ready. */
export declare function wireTraveler(p: {
    id: string;
    from?: string;
    slots?: Record<string, unknown>;
    steps?: TravelerStep[];
    ts?: number;
}): Traveler;

/** Shape law: null when legal, else { code, error } from TRAVEL_CODES. */
export declare function travelerShape(t: unknown): { code: string; error: string } | null;

/** The schema-rizer: current untouched; legacy migrated + stamped; future refuses. */
export declare function schemaRize(t: unknown): Traveler | { code: string; error: string };

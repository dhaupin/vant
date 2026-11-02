/**
 * PM1 acceptance (prd-provider-mode.md section 10, rung PM1):
 *   1. OFF posture - the caps payload matches the provider-never-existed
 *      shape EXACTLY (deep equality against the contract-only shape;
 *      the provider key is absent, not null).
 *   2. ON posture - the provider line is additive and correctly typed;
 *      the contract keys are byte-stable and unchanged.
 *   3. The honest middle - gate ON with NO BOLETE_KV binding still reads
 *      `provider: offering` (storeReady: false), while the account face
 *      answers its typed E-store refusal (that refusal is the P2 lane's
 *      law, pinned in accounts/ledger tests; here we pin the EDGE truth:
 *      offering + storeReady:false, never a posture lie).
 *   4. Malformed numeric envs fall back to defaults (a typo must not
 *      posture-gate the face).
 */

import { describe, expect, it } from "vitest";
import type { PagesEnv } from "../functions/types";
import { providerPosture, PROVIDER_ENV_KEYS, PROVIDER_DEFAULTS } from "../functions/lib/provider";

function baseRelayEnv(): PagesEnv {
    // the minimal shape the caps route needs to serve 200
    return {
        [PROVIDER_ENV_KEYS.mode]: "",
        vant_relay_enabled_not_here: undefined,
        VANT_RELAY_ENABLED: "1",
        VANT_RELAY_GATE_KEY: "g".repeat(32),
    } as unknown as PagesEnv;
}

const goodKv = () => ({ get: () => Promise.resolve(null), put: () => Promise.resolve(), delete: () => Promise.resolve() });

describe("provider posture (PM1)", () => {
    it("OFF posture: no key, no posture, no store claim", () => {
        const env = baseRelayEnv(); // mode = ""
        const p = providerPosture(env as unknown as Record<string, unknown>);
        expect(p.offering).toBe(false);
        expect(p.caps).toBeNull();
        expect(p.storeReady).toBe(false);
    });

    it("ON posture: the caps line carries the owner-ruled envelope", () => {
        const env = baseRelayEnv();
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.mode] = "1";
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.slots] = "100";
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.slotsPerUser] = "1";
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.graceHours] = "48";
        (env as unknown as Record<string, unknown>)["BOLETE_KV"] = goodKv();
        const p = providerPosture(env as unknown as Record<string, unknown>);
        expect(p.offering).toBe(true);
        expect(p.caps).toEqual({
            posture: "offering",
            slots: 100,
            slotsPerUser: 1,
            graceHours: 48,
            storeReady: true,
        });
    });

    it("ON but binding absent: serving yes, store tighten no (the honest middle)", () => {
        const env = baseRelayEnv();
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.mode] = "1";
        const p = providerPosture(env as unknown as Record<string, unknown>);
        expect(p.offering).toBe(true);
        expect(p.caps).not.toBeNull();
        expect(p.caps?.storeReady).toBe(false);
    });

    it("binding half-shaped without methods is NOT storeReady", () => {
        const env = baseRelayEnv();
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.mode] = "1";
        (env as unknown as Record<string, unknown>)["BOLETE_KV"] = { get: 42 };
        const p = providerPosture(env as unknown as Record<string, unknown>);
        expect(p.caps?.storeReady).toBe(false);
    });

    it("malformed numerics fall back to shipped defaults", () => {
        const env = baseRelayEnv();
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.mode] = "1";
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.slots] = "not-a-number";
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.slotsPerUser] = "-3";
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.graceHours] = "0x10";
        const p = providerPosture(env as unknown as Record<string, unknown>);
        expect(p.caps?.slots).toBe(PROVIDER_DEFAULTS.slots);
        expect(p.caps?.slotsPerUser).toBe(PROVIDER_DEFAULTS.slotsPerUser);
        expect(p.caps?.graceHours).toBe(PROVIDER_DEFAULTS.graceHours);
    });

    it("defaults match the shipped law when the envs are simply absent", () => {
        const env = baseRelayEnv();
        (env as unknown as Record<string, unknown>)[PROVIDER_ENV_KEYS.mode] = "true";
        const p = providerPosture(env as unknown as Record<string, unknown>);
        expect(p.caps?.slots).toBe(32);
        expect(p.caps?.slotsPerUser).toBe(1);
        expect(p.caps?.graceHours).toBe(48);
    });
});

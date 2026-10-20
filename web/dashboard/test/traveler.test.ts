import { afterEach, describe, expect, it, vi } from "vitest";
import { mintTraveler, advanceTraveler, localShape } from "../src/lib/travel";
import { wireTraveler, travelerShape } from "../functions/lib/traveler-contract.cjs";
import { travelerSend } from "../src/api";

/**
 * The browser EMITTER lane, pinned (pass 254/256 frontend lane, the
 * traveler carrier tr/1):
 *   M1 — the minter's output IS a legal traveler under the vendored KIT's
 *        shape law (the deep cross-pin: the browser never forks the law).
 *   M2 — identity by content: a minted packet is 64-hex, address-shaped;
 *        different slots mint different addresses; the ledger stays
 *        append-only and ANY edit moves the address (advance = new id).
 *   L1 — the send pre-flight runs the SAME law BEFORE any wire: bent
 *        tr/versions/ledger/id shapes refuse typed E_TRAVELER_* with a
 *        fetch count of zero.
 *   W1 — the wire: travelerSend posts the bridge envelope with event
 *        'relay.travel' + the packet as payload (the browser holds no
 *        gate secret); ok replies surface verbatim, typed refusals ride
 *        ApiError verbatim.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

describe("traveler — the browser emitter (tr/1)", () => {
  it("M1: a minted packet passes the vendored KIT's own shape law", async () => {
    const t = await mintTraveler({ from: "bolete-browser", slots: { title: "the pin" } });
    expect(travelerShape(t)).toBeNull();
  });

  it("M2: identity by content — 64-hex opaque address; edits move it; the ledger is append-only", async () => {
    const a = await mintTraveler({ from: "bolete-client", slots: { title: "a" } });
    const b = await mintTraveler({ from: "bolete-client", slots: { title: "b" } });
    expect(a.id).toMatch(/^[0-9a-f]{64}$/);
    expect(b.id).not.toBe(a.id);
    expect(a.tr).toBe("tr/1");
    expect(a.seq).toBe(1);
    expect(a.steps).toHaveLength(1);
    expect(a.steps[0].op).toBe("open");

    const hopped = await advanceTraveler(a, { op: "station:press", by: "press-2" });
    expect(hopped.id).not.toBe(a.id); // any edit is a NEW address
    expect(hopped.seq).toBe(2);
    expect(hopped.steps.length).toBe(a.steps.length + 1);
    expect(hopped.steps[0]).toEqual(a.steps[0]); // append-only: the birth step untouched
    expect(travelerShape(hopped)).toBeNull();
  });

  it("L1: the send pre-flight refuses bent shapes typed, BEFORE any wire", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const pkt = await mintTraveler({ from: "bolete-client", slots: { title: "x" } });

    const badTr = { ...pkt, tr: "tr/9" };
    expect(localShape(badTr)?.code).toBe("E_TRAVELER_SCHEMA");
    const badId = { ...pkt, id: "not-hex" };
    expect(localShape(badId)?.code).toBe("E_TRAVELER_ADDRESS");
    const badLedger = { ...pkt, seq: 7 }; // seq != steps.length
    expect(localShape(badLedger)?.code).toBe("E_TRAVELER_STEP");
    const badSlots = { ...pkt, slots: [1, 2, 3] };
    expect(localShape(badSlots)?.code).toBe("E_TRAVELER_SHAPE");

    for (const bad of [badTr, badId, badLedger, badSlots]) {
      await expect(travelerSend(bad as never)).rejects.toThrow(/E_TRAVELER_/);
    }
    expect(fetchSpy).not.toHaveBeenCalled(); // the law runs before the wire
  });

  it("W1: travelerSend rides the bridge envelope { event: relay.travel, payload = packet } and surfaces typed refusals", async () => {
    const pkt = await mintTraveler({ from: "bolete-client", slots: { title: "w1" } });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            received: true,
            event: "relay.travel",
            handlers: 0,
            dispatched: 1,
            reply: { ok: true, family: "relay.travel", answer: { ok: true }, ms: 3 },
          }),
          { status: 200 },
        ),
      );
    const reply = (await travelerSend(pkt)) as { ok?: boolean; family?: string; answer?: unknown };
    expect(reply.ok).toBe(true);
    expect(reply.family).toBe("relay.travel");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      event: string;
      from: string;
      payload: Record<string, unknown>;
      v: { major: number };
    };
    expect(body.event).toBe("relay.travel");
    expect(body.from).toBe("bolete-browser");
    expect(body.v.major).toBe(2);
    expect(body.payload).toEqual(pkt as unknown as Record<string, unknown>); // verbatim, no mangling

    // typed refusal propagation: the edge's/law's typed code rides ApiError verbatim
    fetchSpy.mockClear();
    fetchSpy.mockResolvedValue(
        new Response(
          JSON.stringify({
            received: true,
            event: "relay.travel",
            handlers: 0,
            dispatched: 0,
            reply: { ok: false, code: "E_TRAVELER_STEP", error: "ledger law violation at seq 2" },
          }),
          { status: 200 },
        ),
      );
    const pkt2 = await mintTraveler({ from: "bolete-client", slots: { title: "w1r" } });
    await expect(travelerSend(pkt2)).rejects.toThrow(/E_TRAVELER_STEP/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("M3: the KIT's builder law stays the one law — wireTraveler output passes localShape (same law, one source)", () => {
    const steps = [{ seq: 1, op: "open", by: "bolete-client", ts: 0 }];
    const id = "ab".repeat(32); // opaque hex the kit never re-derives
    const pkt = wireTraveler({ id, from: "bolete-client", slots: { title: "k" }, steps });
    expect(localShape(pkt)).toBeNull();
    const bent = wireTraveler({ id: "zz", from: "bolete-client", slots: {} });
    expect(localShape(bent)?.code).toBe("E_TRAVELER_ADDRESS");
  });
});

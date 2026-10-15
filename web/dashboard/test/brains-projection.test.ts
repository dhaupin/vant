import { describe, expect, it } from "vitest";
import { mapProjection } from "../src/modules/brains/projection";

/**
 * The REAL-embedding projection contract (P4, prd-web.md 4 #18): the
 * pods vant_search_semantic (withProjection) answers point 0 = query
 * anchor, points[i + 1] pairs with results[i]. mapProjection must be
 * FAIL-CLOSED: a hostile or shape-mismatched projection is null (the
 * map falls back to the rank view), never a half-guessed plot.
 */

const ok = {
  dims: 2,
  seed: 9,
  points: [
    { x: 0, y: 0 }, // anchor
    { x: 0.5, y: -0.5 },
    { x: -0.25, y: 0.75 },
  ],
  anchorPointIndex: 0,
  hitPointOffset: 1,
  provider: "hash",
  embeddedDim: 384,
};

describe("mapProjection", () => {
  it("maps a well-formed projection onto rows by index", () => {
    const m = mapProjection(ok, ["doc-1", "doc-2"]);
    expect(m).not.toBeNull();
    expect(m!.anchor).toEqual({ x: 0, y: 0 });
    expect(m!.pts).toHaveLength(2);
    expect(m!.pts[0]).toEqual({ x: 0.5, y: -0.5, amber: false, resultIndex: 0 });
    expect(m!.pts[1].resultIndex).toBe(1);
  });

  it("colors NSC9-shaped keys amber (same detection as the list view)", () => {
    const m = mapProjection(ok, ["9-00042-00013-7", "doc-2"]);
    expect(m!.pts[0].amber).toBe(true);
    expect(m!.pts[1].amber).toBe(false);
  });

  it("refuses wrong dims / offsets / lengths (fail-closed, not guessed)", () => {
    expect(mapProjection({ ...ok, dims: 3 }, ["a", "b"])).toBeNull();
    expect(mapProjection({ ...ok, anchorPointIndex: 0, hitPointOffset: 2 }, ["a", "b"])).toBeNull();
    // one point missing -> hostile truncation is NOT a plot
    expect(mapProjection({ ...ok, points: ok.points.slice(0, 2) }, ["a", "b"])).toBeNull();
    // an extra point -> length mismatch is NOT a plot
    expect(mapProjection({ ...ok, points: [...ok.points, { x: 1, y: 1 }] }, ["a", "b"])).toBeNull();
  });

  it("refuses non-finite coordinates anywhere in the point set", () => {
    const bad = { ...ok, points: [{ ...ok.points[1] }, { x: Number.NaN, y: 0.5 }, { x: 0, y: 0 }] };
    expect(mapProjection(bad, ["a", "b"])).toBeNull();
    expect(mapProjection({ ...ok, points: [{ ...ok.points[1], x: Infinity }] }, ["a", "b"])).toBeNull();
  });

  it("refuses hostiles outright: null, numbers, empty, no anchor", () => {
    expect(mapProjection(null, ["a"])).toBeNull();
    expect(mapProjection(42, ["a"])).toBeNull();
    expect(mapProjection({}, ["a"])).toBeNull();
    expect(mapProjection({ ...ok, points: [] }, [])).toBeNull();
  });

  it("accepts an all-NSC9 result set without special casing", () => {
    const keys = ["9-00001-00001-1", "9-00002-00002-2", "9-00003-00003-3"];
    const proj = { ...ok, points: [{ x: 0, y: 0 }, ...keys.map((_, i) => ({ x: i / 3, y: -i / 3 }))] };
    const m = mapProjection(proj, keys);
    expect(m!.pts.every((p) => p.amber)).toBe(true);
  });
});

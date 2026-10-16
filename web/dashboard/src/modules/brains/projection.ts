/**
 * The REAL-embedding projection contract, pure + testable (P4, prd-web.md
 * 4 #18 growth path): the pod's `vant_search_semantic` (withProjection)
 * answers points BY INDEX - point 0 is the query anchor, points[i + 1]
 * pairs with results[i]. This module turns that wire shape into plot
 * data, fail-closed: a hostile projection is NOT a plot (null -> the map
 * falls back to its rank view, honestly labeled).
 */

export interface Projection {
  dims: number;
  seed: number;
  points: Array<{ x: number; y: number }>;
  anchorPointIndex: number;
  hitPointOffset: number;
  provider: string | null;
  embeddedDim: number | null;
}

/** One plot point joined to its result row by the pod's index contract. */
export interface PlotPoint {
  x: number;
  y: number;
  /** true when the paired row's key parses as an NSC9-style address */
  amber: boolean;
  /** result index this point represents (0-based); -1 = the query anchor */
  resultIndex: number;
}

export interface MappedProjection {
  anchor: { x: number; y: number } | null;
  pts: PlotPoint[];
}

/** NSC9 shape (9-NNNNN-NNNNN-N) - same detection the list view uses. */
function nscLike(key: string): boolean {
  return /^9-\d{5}-\d{5}-\d$/.test(key.trim());
}

/**
 * Validate + map a wire projection onto the result rows. Contract-checked
 * at every step: dims 2, anchor index 0, hit offset 1, exactly
 * rows.length + 1 finite points. Any mismatch -> null (NOT a guess).
 */
export function mapProjection(
  projection: unknown,
  rowKeys: string[],
): MappedProjection | null {
  if (!projection || typeof projection !== "object") return null;
  const p = projection as Partial<Projection>;
  if (
    p.dims !== 2 ||
    p.anchorPointIndex !== 0 ||
    p.hitPointOffset !== 1 ||
    !Array.isArray(p.points) ||
    p.points.length !== rowKeys.length + 1
  ) {
    return null;
  }
  const anchor = p.points[0];
  if (!anchor || typeof anchor.x !== "number" || typeof anchor.y !== "number") return null;
  const pts: PlotPoint[] = [];
  for (let i = 1; i < p.points.length; i++) {
    const pt = p.points[i];
    if (!pt || typeof pt.x !== "number" || typeof pt.y !== "number" || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      return null;
    }
    if (i - 1 >= rowKeys.length) return null;
    pts.push({ x: pt.x, y: pt.y, amber: nscLike(rowKeys[i - 1]), resultIndex: i - 1 });
  }
  return {
    anchor: Number.isFinite(anchor.x) && Number.isFinite(anchor.y) ? { x: anchor.x, y: anchor.y } : null,
    pts,
  };
}

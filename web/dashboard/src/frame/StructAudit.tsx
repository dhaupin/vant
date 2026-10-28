import * as React from "react";

/**
 * StructAudit — the combined STRUCT audit data contract + adapter stubs
 * (vant issue #264). Kit holds the SHAPES and the pure verdict/redaction
 * logic; the two flavors (web/home /audit, web/dashboard /struct-audit)
 * render their own presentations. One page, four STRUCT families:
 *
 *   packstruct  — pack conformance (the audit-conformance gate)
 *   crashtest   — the packs floor (rows, contract, native suites)
 *   eyestruct   — the vision battery's findings npm feed
 *   poststruct  — the render/docs audit's findings feed (PRD-staged)
 *
 * EPOCH LAW (honest by construction): the page is in its mock-feed
 * skeleton epoch (issue #264 step a). Every feed here carries
 * `mock: true` and renders a MOCK identity chip; nothing reads a
 * network, nothing fabricates a green. LIVE feeds land in the same
 * Shape (b: crashtest run-root emits, c: packstruct gate, d: the
 * eyestruct + poststruct npm feeds) and the chips flip with the data.
 *
 * The one pre-staged adapter: parsePoststructFeed below, built against
 * the PRD contract -- poststruct graduated from its gistory staging
 * branch to dhaupin/poststruct (still pre-npm, staged 0.9.0); the emit
 * shape is versioned and pinned there, so the endpoint stands ready
 * for the npm landing.
 */

export type StructSource = "packstruct" | "crashtest" | "eyestruct" | "poststruct";

/** The only sources the board renders; unknown is a typed refusal, never a guess. */
export const STRUCT_SOURCES: StructSource[] = ["packstruct", "crashtest", "eyestruct", "poststruct"];

export interface StructFinding {
  /** the finding's own id in the emitting tool's namespace */
  id: string;
  /** page / route / pack the finding names, when the tool carries one */
  page?: string;
  level: "fail" | "warn" | "info";
  message: string;
}

export interface StructFeed {
  source: StructSource;
  /** the feed resolved cleanly (a typed absence is ok:false + reason) */
  ok: boolean;
  /** the emitting tool's feed/schema version */
  version?: string;
  /** ISO stamp from the tool or its run */
  generatedAt?: string;
  /** the tool's own counts block, verbatim */
  counts?: Record<string, number | undefined>;
  findings?: StructFinding[];
  /** skeleton epoch: data is the inline mock, never tool output */
  mock?: boolean;
  /** typed absence reason (feed not wired yet, npm unpublished, ...) */
  error?: string;
  /** where the real feed will come from (stated, never silently blank) */
  sourceHref?: string;
}

/** The verdict families the board renders (issue's three bands). */
export type StructVerdict = "PASS" | "FINDINGS" | "DRIFT" | "ABSENT";

/** Pure verdict derivation: exported so tests pin it word-for-word. */
export function verdictOf(feed: StructFeed): StructVerdict {
  if (!feed.ok) return "ABSENT";
  if ((feed.counts?.fail ?? 0) > 0 || (feed.findings ?? []).some((f) => f.level === "fail")) {
    return "FINDINGS";
  }
  return "PASS";
}

/**
 * The poststruct adapter stub. Input contract per the staging PRD's
 * --json emit (versioned, top-level):
 *   { version, counts: { fail, warn }, findings: [{ page, id, level, message }] }
 * Typed refusals only, never a shape guess: E_POSTSTRUCT_SHAPE states the
 * field that failed. `ok:false` feeds stay ABSENT on the board honestly.
 */
export function parsePoststructFeed(raw: unknown): { feed?: StructFeed; error?: string } {
  if (typeof raw !== "object" || raw === null) {
    return { error: "E_POSTSTRUCT_SHAPE: emit is not an object" };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== "string" || r.version.length === 0) {
    return { error: "E_POSTSTRUCT_SHAPE: emit carries no version string" };
  }
  const counts = r.counts;
  if (typeof counts !== "object" || counts === null) {
    return { error: "E_POSTSTRUCT_SHAPE: emit carries no counts block" };
  }
  if (!Array.isArray(r.findings)) {
    return { error: "E_POSTSTRUCT_SHAPE: emit carries no findings array" };
  }
  const findings: StructFinding[] = [];
  for (const f of r.findings) {
    if (typeof f !== "object" || f === null) {
      return { error: "E_POSTSTRUCT_SHAPE: a finding row is not an object" };
    }
    const fr = f as Record<string, unknown>;
    if (typeof fr.id !== "string" || typeof fr.level !== "string") {
      return { error: "E_POSTSTRUCT_SHAPE: a finding row lacks id or level" };
    }
    const level = fr.level;
    if (level !== "fail" && level !== "warn" && level !== "info") {
      return { error: `E_POSTSTRUCT_SHAPE: finding ${String(fr.id)} has unknown level ${level}` };
    }
    findings.push({
      id: fr.id,
      page: typeof fr.page === "string" ? fr.page : undefined,
      level,
      message: typeof fr.message === "string" ? fr.message : "",
    });
  }
  const c = counts as Record<string, unknown>;
  return {
    feed: {
      source: "poststruct",
      ok: true,
      version: r.version,
      generatedAt: typeof r.generatedAt === "string" ? r.generatedAt : undefined,
      counts: {
        fail: typeof c.fail === "number" ? c.fail : undefined,
        warn: typeof c.warn === "number" ? c.warn : undefined,
      },
      findings,
    },
  };
}

/**
 * The skeleton epoch's inline mocks — one per family, shaped EXACTLY as
 * the real feeds will land (the adapter contract above is poststruct's;
 * the others mirror the tools' stamped README surfaces as of 2026-10-28).
 * Nothing here is fetched; the mock chip rides every card until a real
 * feed replaces it.
 */
export const MOCK_STRUCT_FEEDS: StructFeed[] = [
  {
    source: "packstruct",
    ok: true,
    mock: true,
    generatedAt: "2026-10-28",
    counts: { packs: 21, ids: 291, honored: 7, pinned: 1 },
    findings: [
      {
        id: "audit-conformance",
        page: "vant-spine",
        level: "info",
        message: "7/8 conformance honored; 1 pinned known finding, honest and tracked in packs/README.md.",
      },
    ],
    sourceHref: "https://www.npmjs.com/package/packstruct",
  },
  {
    source: "crashtest",
    ok: true,
    mock: true,
    generatedAt: "2026-10-28",
    counts: { packRows: 261, refused: 261, exploited: 0, skips: 6, contract: 372, nativeSuites: 220 },
    findings: [
      {
        id: "restamp-8",
        level: "info",
        message:
          "Full packs 261 rows REFUSED x2 deterministic, 0 EXPLOITED/BOUNDED; contract 372/0; native floor 220 suites green. Live emit replaces this card when step (b) wires the run-root JSON.",
      },
    ],
    sourceHref: "https://www.npmjs.com/package/crashtest",
  },
  {
    source: "eyestruct",
    ok: true,
    mock: true,
    generatedAt: "2026-10-28",
    counts: { fail: 0, warn: 0 },
    findings: [
      {
        id: "npm-landing",
        level: "info",
        message: "The eyestruct package is live on npm; the findings feed wires in at step (d). No vision findings are claimed by this mock.",
      },
    ],
    sourceHref: "https://www.npmjs.com/package/eyestruct",
  },
  {
    source: "poststruct",
    ok: false,
    mock: true,
    error: "absent: the poststruct npm package is pre-publish (staged 0.9.0; PRD-staged in dhaupin/poststruct). The page states the absence; nothing is graded.",
    sourceHref: "https://github.com/dhaupin/poststruct",
  },
];

/** Evidence slice: the first N findings, capped so a page stays a slice. */
export function evidenceSlice(feed: StructFeed, n = 3): StructFinding[] {
  return (feed.findings ?? []).slice(0, n);
}

/* --------------------- the board's rendering bits --------------------- */

const VERDICT_CLASS: Record<StructVerdict, string> = {
  PASS: "border-moss/40 bg-moss/10 text-moss",
  FINDINGS: "border-warn/40 bg-warn/10 text-warn",
  DRIFT: "border-err/40 bg-err/10 text-err",
  ABSENT: "border-line bg-surface text-ink-soft",
};

const SOURCE_LABEL: Record<StructSource, string> = {
  packstruct: "packstruct (pack conformance)",
  crashtest: "crashtest (the packs floor)",
  eyestruct: "eyestruct (the vision battery)",
  poststruct: "poststruct (the render audit)",
};

function VerdictChip({ verdict }: { verdict: StructVerdict }) {
  return (
    <span className={"rounded-full border px-2 py-0.5 text-[11px] font-medium " + VERDICT_CLASS[verdict]}>
      {verdict}
    </span>
  );
}

function MockChip() {
  return (
    <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] text-warn">
      MOCK SKELETON
    </span>
  );
}

/** The typed refusal for an unknown source: the card names the shape law. */
export function StructAuditRefuse({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg border border-err/40 bg-err/5 p-3 text-sm">
      <p className="font-medium text-err">{reason}</p>
      <p className="mt-1 text-xs text-ink-soft">
        The board renders only the four STRUCT sources (packstruct, crashtest,
        eyestruct, poststruct); the caller names the family, never the renderer.
      </p>
    </div>
  );
}

export interface StructAuditBoardProps {
  feeds: unknown[];
  /** evidence slice size (default 3) */
  cap?: number;
}

/**
 * The pure board (KIT LAW, same shape as CarrierShare): no fetches, no
 * state, no runtime APIs. Unknown/absent-source cards render the typed
 * refusal; ABSENT feeds state their absence verbatim (“nothing is graded”).
 * Counts render verbatim as the tool stated them.
 */
export function StructAuditBoard({ feeds, cap = 3 }: StructAuditBoardProps): React.ReactElement {
  return (
    <div className="space-y-4">
      {feeds.map((f, i) => {
        if (typeof f !== "object" || f === null) {
          return <StructAuditRefuse key={`refuse-${i}`} reason="E_STRUCT_SOURCE: the feed row is not an object" />;
        }
        const feed = f as StructFeed;
        if (!STRUCT_SOURCES.includes(feed.source)) {
          return (
            <StructAuditRefuse key={`refuse-${i}`} reason={`E_STRUCT_SOURCE: unknown STRUCT source "${String(feed.source)}"`} />
          );
        }
        const verdict = verdictOf(feed);
        return (
          <div key={feed.source} className="rounded-lg border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictChip verdict={verdict} />
              {feed.mock ? <MockChip /> : null}
              <h3 className="text-sm font-semibold">{SOURCE_LABEL[feed.source]}</h3>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {feed.ok
                ? [
                    feed.version ? `feed ${feed.version}` : null,
                    feed.generatedAt ? `generated ${feed.generatedAt}` : null,
                    feed.counts
                      ? Object.entries(feed.counts)
                          .filter(([, v]) => v !== undefined)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(", ")
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : feed.error || "absent (no reason stated)"}
            </p>
            <div className="mt-3 space-y-2">
              {verdict === "ABSENT" ? (
                <p className="text-xs text-ink-soft">
                  {feed.error
                    ? feed.error.split(";")[0]
                    : "The feed is absent; the page states it and grades nothing."}
                </p>
              ) : (
                evidenceSlice(feed, cap).map((fd) => (
                  <p key={fd.id} className="text-xs text-ink">
                    <span className={"font-mono uppercase " + (fd.level === "fail" ? "text-err" : fd.level === "warn" ? "text-warn" : "text-ink-soft")}>
                      {fd.level}
                    </span>{" "}
                    {fd.page ? <span className="font-mono">[{fd.page}]</span> : null} {fd.message}
                  </p>
                ))
              )}
            </div>
            {feed.sourceHref ? (
              <p className="mt-2 text-[11px] text-ink-soft">
                <a className="underline decoration-line hover:decoration-ink-soft" href={feed.sourceHref} target="_blank" rel="noopener noreferrer">
                  {feed.sourceHref}
                </a>
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

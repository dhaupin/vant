import type { StructFeed } from "../../frame/StructAudit";
import { StructAuditBoard, StructAuditRefuse, MOCK_STRUCT_FEEDS } from "../../frame/StructAudit";
import liveCrashFeed from "../../generated/struct-feed.json";
import livePackstructFeed from "../../generated/struct-feed-packstruct.json";
import liveEyestructFeed from "../../generated/struct-feed-eyestruct.json";
import { Help } from "../../frame/Tooltip";

/**
 * Module: struct-audit (vant issue #264). One page, the four STRUCT
 * families side by side: packstruct (pack conformance), crashtest
 * (the packs floor), eyestruct (the vision battery), poststruct (the
 * render audit, PRD-staged until its npm lands). The data contract,
 * the verdict derivation, and the poststruct adapter live in the kit
 * (web/kit/components/struct-audit.tsx) and ride vendored + hash-pinned.
 *
 * FEED SOURCES (steps b + c + d landed): the crashtest verdict ledger,
 * the packstruct dual-emit row (lint --deep --json + the audit gate's
 * own verdict line) and the eyestruct gate row all read their stamped
 * feeds (src/generated/struct-feed*.json, written byte-identically by
 * scripts/struct-feed-stamp.js with .sha256 pins; regenerate with
 * `npm run struct:stamp` per row after a wave). Only poststruct is the
 * kit's inline mock (MOCK SKELETON + an honest absence - its npm package
 * is staged 0.9.0, pre-publish).
 */

// The live stamps replace their mock twins at position; the shapes are
// identical by construction (the stamps derive them - kit contract).
const LIVE: Record<string, StructFeed> = {
  crashtest: liveCrashFeed as StructFeed,
  packstruct: livePackstructFeed as StructFeed,
  eyestruct: liveEyestructFeed as StructFeed,
};
const FEEDS: StructFeed[] = MOCK_STRUCT_FEEDS.map((f) => LIVE[f.source] ?? f);

export default function StructAudit() {
  return (
    <div>
      <h1 className="text-lg font-semibold">Struct audit</h1>
      <p className="mt-1 text-sm text-ink-soft">
        The four STRUCT families' findings, combined. Three cards ride
        their live stamped feeds (the crashtest verdict ledger, the
        packstruct dual emit, the eyestruct gate); only poststruct is
        the kit's inline mock until its npm lands (issue #264) —
        nothing here is fetched or graded beyond what a stamp measured.
      </p>

      <Help text="The kit's contract: a feed is { source, ok, version?, generatedAt?, counts?, findings?, mock?, error? }; verdicts derive pure — PASS / FINDINGS / ABSENT (there is no DRIFT band until a feed carries drift semantics); an unknown source is a typed E_STRUCT_SOURCE refusal, never a guess. poststruct's adapter parses the PRD's versioned --json emit ({ version, counts: { fail, warn }, findings: [{ page, id, level, message }] }), refusing shape drift typed.">
        <p className="mb-3 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">
          The STRUCT families
        </p>
      </Help>

      <StructAuditBoard feeds={FEEDS} />

      <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">The honest guarantees of this page</p>
        <p className="mt-1">
          1. Every stamped card shows its stamp's own date and provenance
          (the _stamp receipt); the one unlanded card (poststruct) shows
          the MOCK SKELETON chip and grades nothing.
          2. The poststruct card renders an ABSENT verdict — the npm package
          is staged (0.9.0), so the page states the absence and grades nothing.
        </p>
        <p className="mt-2">
          If a card ever shows a verdict without its underlying emit, that is
          a bug in this module — file it against the STRUCT page, not the
          tools themselves.
        </p>
      </div>
      {/* the typed refusal stays exported + reachable so callers of the
          kit shape (home flavor, future embeds) keep one refusal text */}
      <span className="hidden">
        <StructAuditRefuse reason="E_STRUCT_SOURCE: unreachable by design — kept for type surface" />
      </span>
    </div>
  );
}

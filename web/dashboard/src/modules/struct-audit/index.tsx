import { StructAuditBoard, StructAuditRefuse, MOCK_STRUCT_FEEDS } from "../../frame/StructAudit";
import { Help } from "../../frame/Tooltip";

/**
 * Module: struct-audit (vant issue #264, step a — the mock-feed static
 * skeleton). One page, the four STRUCT families side by side:
 * packstruct (pack conformance), crashtest (the packs floor),
 * eyestruct (the vision battery), poststruct (the render audit, PRD-
 * staged until its npm lands). The data contract, the verdict
 * derivation, and the poststruct adapter live in the kit
 * (web/kit/components/struct-audit.tsx) and ride vendored + hash-pinned.
 *
 * EPOCH LAW: every feed is the kit's inline mock and renders its MOCK
 * SKELETON chip — this page fabricates no green. Steps (b)–(d) wire
 * the real emits (crashtest run-root JSON, the packstruct gate, the
 * eyestruct/poststruct npm feeds) into the same shape and the chips
 * flip with the data.
 */

export default function StructAudit() {
  return (
    <div>
      <h1 className="text-lg font-semibold">Struct audit</h1>
      <p className="mt-1 text-sm text-ink-soft">
        The four STRUCT families' findings, combined. Skeleton epoch: the
        cards are the kit's inline mocks until the real feed wiring lands
        (issue #264 steps b–d) — nothing here is fetched or graded.
      </p>

      <Help text="The kit's contract: a feed is { source, ok, version?, generatedAt?, counts?, findings?, mock?, error? }; verdicts derive pure — PASS / FINDINGS / ABSENT (there is no DRIFT band until a feed carries drift semantics); an unknown source is a typed E_STRUCT_SOURCE refusal, never a guess. poststruct's adapter parses the PRD's versioned --json emit ({ version, counts: { fail, warn }, findings: [{ page, id, level, message }] }), refusing shape drift typed.">
        <p className="mb-3 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-soft">
          The STRUCT families
        </p>
      </Help>

      <StructAuditBoard feeds={MOCK_STRUCT_FEEDS} />

      <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm text-ink-soft">
        <p className="font-medium text-ink">Two honest guarantees of this page's epoch</p>
        <p className="mt-1">
          1. Every card shows the MOCK SKELETON chip while its data is inline.
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

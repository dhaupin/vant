# migrate-test-to-tests.md

> **Status: SCHEDULED, WAITING (not started).** Filed 2026-10-30 out of the
> vant#260 wave-19 session; full detail also lives on **vant#277**. The owner's
> ruling: this is a **medium/large job**, it waits on its own wave, and this
> file is its recorded plan. When the wave runs, execute from here and receipt
> on vant#277.

---

## 1. The verdict (measured, not guessed)

Renaming the pod `test/` folder to `tests/` is a **one-wave, ~half-day,
almost entirely mechanical job**. Nothing is architecturally hard. The cost
is *completeness* (~250 path references on the tree) plus **one genuinely
risky seam** (the struct-feed stamp chain, §5.4) whose failure surfaces at a
distance instead of locally — plus one cultural caveat that makes it a
convention flip, not a stray rename:

- Commit `4788a1a4` — *"the /tests stragglers fold into /test - the ship lane
  suite moves home"* — was a **deliberate consolidation in the other
  direction**. This wave reverses a named prior call, so it takes:
  - its own wave (never piggy-backed on feature work), and
  - a `CHANGELOG.md` `[Unreleased]` note recording the **why**, like every
    other convention change on this tree.

## 2. Scope

**In scope:** the repo-root pod `test/` directory ONLY. Currently
**231 files**, of which **221 are `*.test.js`** suites.

**Out of scope:** the web apps' own suites. Every web app is fully
self-contained (own `package.json`, own build; `web/home/test/*.test.mjs`,
web/dashboard suites, web/relay). The one-way pod↔web library boundary is
untouched by this rename, and their internal paths do not change. (The web
tree IS touched in exactly one place — the generated struct-feed stamps,
§5.4 — but their *source* naming is not.)

## 3. Measured reference inventory (2026-10-30 tree)

| Area | Refs | Files | Treatment |
|---|---|---|---|
| `labs/` (archived PRDs/plans, incl. this file) | 368 | 28 | **leave alone** — history |
| `test/` self-refs ("Run: node test/…" headers, harness constants) | 134 | 99 | mechanical rename inside the moved dir |
| `web/` (web/home's own test dir naming + generated stamps) | 56 | 12 | only the **generated stamp artifacts** need restamping (§5.4) |
| `docs/` | 36 | 14 | same-wave docs sweep (§6) |
| `lib/` | 30 | 26 | mechanical; one live output (§5.5) |
| `scripts/` | 18 | 8 | constants + comments (§5.1/§5.4) |
| `.github/workflows/test.yml` | 5 | 1 | load-bearing (§5.1) |
| root `package.json` | 5 | 1 | load-bearing (§5.2) |
| `CHANGELOG.md` + generated `changelog.json` | — | — | **leave alone** — historical text never gets rewritten |

## 4. Failure law

A missed reference is a **lie to the next agent**, not a build error. Stale
`Run: node test/…` headers and dead docs commands are the two most likely
survivors. The completeness rule: after ship, `grep -r "test/"` excluding
`CHANGELOG.md`, `changelog.json`, and `labs/` must return only intentional
`tests/` hits.

## 5. The load-bearing seams (all move in ONE commit)

1. **CI workflow** — `.github/workflows/test.yml` runs the lane through
   literal paths: `node test/ci.js`, `test/runner.js`, `test/run-all.js`,
   `test/ci-crashtest-gate.js`. Wrong here = CI red on the first push.
2. **root `package.json`** — `test:crashtest`, `sweep`, `check` (the shell
   glob loop over `test/*.js`), and `lint` (`eslint lib/ test/`).
3. **Harness self-refs** — `test/run-all.js` discovery order, runner usage
   strings, and the per-suite `Run:` doc headers across ~99 files.
   Mechanical sed, but exhaustive: sweep them all.
4. **⚠️ The struct-feed stamp chain — the one real risk.**
   - `scripts/struct-feed-stamp.js:33` pins `SUITE = 'test/crashtest-packs.test.js'`;
     that path lands inside the generated feed (the `from` field and the
     message line "Measured live by test/crashtest-packs.test.js").
   - The stamp script writes the **vendoring ring**: byte-identical
     `web/home/src/generated/struct-feed.json` and
     `web/dashboard/src/generated/struct-feed.json`, each with a `.sha256`
     pin sidecar, and `--check` (run in CI) verifies the pins.
   - **Consequence:** a rename without a same-commit restamp turns the
     struct-feed pin CI RED in *both* web flavors — a failure that surfaces
     at a distance, not in the pod suite. Restamp IS the wave: run the
     (renamed-path) contract suite or feed `--from-json` from a fresh
     sentinel dump, stamp both flavors, ship the four files (2 JSON +
     2 sidecars) together.
   - Related refs: `scripts/crashtest-run.js:8` and `:1851` carry the same
     suite path.
5. **A live runtime output** — `lib/audit-report.js:111` writes a real deep
   link into every generated audit report:
   `[Run locally](<repoUrl>/blob/main/test/ci.js)`. Not a comment — a
   user-visible URL that would 404 after the rename if not updated.
6. **Ignore/pattern rules** — `.eslintignore` and `.gitignore` carry
   `test/tmp/` scratch rules; `scripts/check-fiction-signatures.js` carries
   a `test/tmp` rule too.

## 6. Execution plan (one wave, in order)

1. `git mv test tests` (rename-pure; `git log --follow` keeps history readable).
2. Workflows + root `package.json` + `.eslintignore`/`.gitignore`.
3. Harness constants + the exhaustive self-ref sweep inside `tests/`.
4. `lib/` and `scripts/` sweeps; update the `SUITE` constant in
   `struct-feed-stamp.js`; update the audit-report deep link.
5. Run the full pod cycle **from the new paths**: the sweep (expect
   **220/220** per the wave-17.2 green baseline), the crashtest gate,
   `lint`, `check`.
6. **Restamp the struct-feed ring** (both flavors + both `.sha256`
   sidecars); verify `node scripts/struct-feed-stamp.js --check` is green.
7. Docs sweep — the 36 refs across the 14 living pages, including
   copy-paste-affecting `node test/…` commands in `docs/operations/ci.md`,
   `docs/operations/testing.md`, `docs/operations/relay-playbook.md`,
   `docs/reference/cli.md`, `docs/advanced/agent-contributors.md`, and the
   deep links in `docs/whitepaper/agent-first.md`. Skip archives/history.
8. `CHANGELOG.md` `[Unreleased]` note: the convention flip, and the explicit
   reversal of `4788a1a4` (with the why).
9. Commit `agent-buffy: wave NN - test/ -> tests/ rename ...`, push
   `axolotl`, watch BOTH CI jobs, PR into `staging` as usual.

## 7. Verification checklist (the receipt's spine)

- [ ] `npm run sweep` → 220/220 (or better) from the new paths
- [ ] `npm run lint` and `npm run check` green (globs updated)
- [ ] crashtest gate green; `node scripts/struct-feed-stamp.js --check`
      green on both flavors
- [ ] web/home + web/dashboard suites still green (they must be untouched;
      the check proves the self-contained law held)
- [ ] `grep -r "test/"` excluding `CHANGELOG.md` / generated history /
      `labs/` returns only intentional `tests/` hits
- [ ] CI green on the `axolotl` push (`ci` + `crashtest` jobs)

## 8. Washed away

Nothing is decommissioned by this wave except the directory name. If a
reference refuses to move (e.g. an external fixed URL), name it here and
stop rather than papering over it.

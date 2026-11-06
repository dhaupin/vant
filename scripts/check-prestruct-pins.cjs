// check-prestruct-pins.cjs - the family prestruct floor guard.
//
// Two rules, both mechanical (no deps: reads two files, compares semver,
// matches markers):
//
//   1. FLOOR - web/home's prestruct pin must be a caret floor at or above the
//      family floor (^1.3.0). An exact older pin (1.1.0) or a floating range
//      (*, latest, ~) is refused: a range floats the engine (a random build),
//      an old pin misses the 1.3.0 fixes the site depends on.
//
//   2. VENDORED COPY FRESHNESS - web/home/src/islands.js is a vendored copy of
//      the engine's init template, never edited locally. Its header must name
//      the pinned prestruct version AND the file must carry the 1.3.0 island
//      observer-lifecycle markers (the `observing` WeakSet + the `observers`
//      WeakMap added in prestruct 59cb046). The pre-1.3.0 94-line copy lacks
//      them, so a stale vendored file fails here instead of shipping a
//      duplicate-IntersectionObserver bug on every SPA re-scan.
//
// Usage: node scripts/check-prestruct-pins.cjs [rootDir]
//   rootDir overrides the repo root so the guard's own battery can drive it
//   over temp fixtures (both ways), per the house test rule.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const HOME_PKG = path.join(ROOT, 'web', 'home', 'package.json');
const ISLANDS = path.join(ROOT, 'web', 'home', 'src', 'islands.js');

// The family floor: the prestruct version every repo pins at or above.
const FLOOR = '1.3.0';

const problems = [];

function parseSemver(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmp(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
}

if (!fs.existsSync(HOME_PKG)) {
  console.error(`PRESTRUCT PINS: FAIL (${path.relative(ROOT, HOME_PKG)} is missing)`);
  process.exit(1);
}

// ---- 1. the pin is a caret floor at/above FLOOR ----
const pkg = JSON.parse(fs.readFileSync(HOME_PKG, 'utf8'));
const pin = pkg.devDependencies && pkg.devDependencies.prestruct;
let pinnedVersion = null;

if (typeof pin !== 'string' || pin === '') {
  problems.push(`web/home/package.json: no "prestruct" devDependency pin`);
} else if (!/^\^?\d+\.\d+\.\d+$/.test(pin)) {
  problems.push(
    `web/home/package.json: prestruct pin "${pin}" floats - use a caret floor (^${FLOOR}) or an exact version, never a range`
  );
} else {
  pinnedVersion = pin.replace(/^\^/, '');
  const got = parseSemver(pinnedVersion);
  const floor = parseSemver(FLOOR);
  if (cmp(got, floor) < 0) {
    problems.push(
      `web/home/package.json: prestruct pin "${pin}" is below the family floor ^${FLOOR}`
    );
  }
}

// ---- 2. the vendored copy names the pin and carries the 1.3.0 markers ----
if (!fs.existsSync(ISLANDS)) {
  problems.push(`web/home/src/islands.js is missing (the vendored engine copy)`);
} else {
  const src = fs.readFileSync(ISLANDS, 'utf8');
  if (pinnedVersion && !src.includes(`prestruct@${pinnedVersion}`)) {
    problems.push(
      `web/home/src/islands.js: header does not name the pinned prestruct@${pinnedVersion} (stale vendored copy - refresh from the engine's init/src/islands.js)`
    );
  }
  const markers = [
    ['the observing WeakSet (island observer lifecycle)', /const\s+observing\s*=\s*new\s+WeakSet\s*\(/],
    ['the observers WeakMap (observer teardown)', /const\s+observers\s*=\s*new\s+WeakMap\s*\(/],
    ['the mountIslands export', /export\s+function\s+mountIslands\s*\(/],
  ];
  for (const [label, re] of markers) {
    if (!re.test(src)) {
      problems.push(`web/home/src/islands.js: missing ${label} - the vendored copy predates prestruct ${FLOOR}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`PRESTRUCT PINS: FAIL (${problems.length} problem(s) - the family floor is ^${FLOOR})`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

console.log(
  `PRESTRUCT PINS: PASS (web/home pins prestruct "${pin}", the vendored islands.js names prestruct@${pinnedVersion} and carries the ${FLOOR} observer-lifecycle markers)`
);

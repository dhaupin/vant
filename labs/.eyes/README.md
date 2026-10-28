# labs/.eyes/ — the visual memory

Owned by **eyestruct** (npm `eyestruct@^0.9.0`, dev-dependency). The
crashtest pattern aimed at appearance instead of attackability.

- `manifest.yml` — the pin (browser image + renderer) and the first-doors
  route x view x theme matrix. Hand-editable; captures refuse to run under
  any pin other than the one the baselines were cut under.
- `ledger.json` — append-only rows (adopt proposals, ratified canon, wave
  rows). **Canon is CI-cut**: baselines are only adopted through the
  ledger, never silently replaced.
- `<route-slug>/<view>/current.png` — committed baselines, adopted as the
  look verbs produce them.

Verbs (LAN-local, need the pinned chrome): `look`, `diff`, `walk`,
`ratify`, `raster`. Browserless verbs (work in CI): `init`, `ledger`,
`gate`, `adopt`.

CI lane: `npm run test:eyes` (=`eyestruct gate`) — exit 0 when every
committed visual artifact is explained by a ledger row and every row
references a live artifact on disk; exit 1 on DANGLING_ROW or UNRECORDED
(explained drift is fine, unexplained is not).

Vant's first-doors matrix: home `/` (desktop + mobile dark), `/status`,
and the dashboard surface. Widen deliberately, one route at a time.

// poststruct.config.js (vant)
// ============================
// The repo-level poststruct audit contract (poststruct@0.9.0, - the fourth
// STRUCT family: poststruct audits what SHIPPED). Config is a .js (not .json)
// because the whole point is a comment for a human: what we tuned and why.
//
// THE ONE TUNE: `language/dash-class`. poststruct's family default FAILs
// em/en dashes in prose ("use a hyphen" - the strict house style upstream).
// Vant's own copy deliberately writes em and en dashes (the changelog,
// packs/README, docs): the dash is this repo's punctuation house style, per
// the same law that made poststruct's own config "tunable per class". We
// demote the class to `warn` - the finding stays visible on the board (the
// counts statement carries it), the gate stays fair, and the language
// module's other teeth (cliches, lorem, whitespace, banned terms) all stay
// at their family defaults.
//
// Everything else is poststruct's default contract: head/site/links/i18n/
// a11y/feeds. FAIL findings still exit 1 in the CI gate; warns-only exits 0.
export default {
    checks: {
        'language/dash-class': 'warn',
    },
}

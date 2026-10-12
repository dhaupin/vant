/**
 * Door-pin table (issue #181 Part A).
 *
 * DATA ONLY — the engine lives in test/door-pin.js. Each entry:
 * {
 *   name,         unique pin label (include the door + why)
 *   bin, args,    the argv contract
 *   exit,         expected exit code (default 0)
 *   match,        regex(es) the combined stdout must satisfy — sourced from
 *                 the door's OWN usage text (help header IS the contract)
 *   matchErr,     optional stderr regex
 * }
 *
 * Batch 1 = the doors that produced QC bugs (#168–#173 class): a CLI door
 * whose invocation contract drifted from its lib. Priority order from the
 * issue: sync, config, msg, encrypt, governance, forum, horcrux — then
 * core/era/trace/memory/search/escrow/nodes/backup doors that are cheap to
 * pin without external auth. The table grows in alphabetical passes; see
 * #181 for the full-125 acceptance target.
 */
const PINS = [

    // ---- Priority: the drift-class doors --------------------------------

    {   // #168: --status was joined OFF the program name (ran literal `status`)
        name: 'sync --status (git porcelain, #168)',
        bin: 'sync.js', args: ['--status'], exit: 0,
        match: [/On branch/]
    },
    {   // bare default pull on a configless tree is a REFUSAL (exit 1)
        name: 'sync bare => refusal exit 1 (configless)',
        bin: 'sync.js', args: [], exit: 1,
        match: [/pull|Push|pull\/push|Usage|refus|config/i]
    },
    {   // #169: template stringified section values → [object Object]
        name: 'config list (no [object Object], key=value shape, #169)',
        bin: 'config.js', args: ['list'], exit: 0,
        match: [/\w+=[^=]/],
        notMatch: ['[object Object]']
    },
    {   // config usage doc is the contract
        name: 'config --help shows get/set/list verbs',
        bin: 'config.js', args: ['--help'], exit: 0,
        match: [/get <key>/, /set <key> <value>/, /list/]
    },

    // ---- msg (all #170 verbs) -------------------------------------------
    {
        name: 'msg --help lists the channel verbs (#170)',
        bin: 'msg.js', args: ['--help'], exit: 0,
        match: [/msg send <to>/, /msg channels/, /msg unread/, /msg read <id>/]
    },
    {
        name: 'msg unread exits 0 with a count (no crash on null info, #170)',
        bin: 'msg.js', args: ['unread'], exit: 0,
        match: [/Unread:\s*\d+/]
    },
    {
        name: 'msg channels exits 0 (no crash, #170)',
        bin: 'msg.js', args: ['channels'], exit: 0,
        notMatch: ['TypeError', 'is not a function', 'Cannot read propert']
    },
    {
        name: 'msg list exits 0 with the list banner',
        bin: 'msg.js', args: ['list'], exit: 0,
        notMatch: ['TypeError', 'is not a function']
    },

    // ---- encrypt (#171) --------------------------------------------------
    {
        name: 'encrypt hash prints salt:hash digest (#171)',
        bin: 'encrypt.js', args: ['hash', 'qc-door-171-seed'], exit: 0,
        match: [/^[0-9a-f]+:[0-9a-f]{64,}/m]
    },
    {
        name: 'encrypt --help shows verify verb (#171)',
        bin: 'encrypt.js', args: ['--help'], exit: 0,
        match: [/verify <hash> <data>/]
    },

    // ---- governance (#173) ------------------------------------------------
    {
        name: 'governance --help shows decide/status/list/stats (#173)',
        bin: 'governance.js', args: ['--help'], exit: 0,
        match: [/decide <topic> <proposal>/, /status <topic>/, /stats/]
    },
    {   // #173: lib returns allowed/denied; CLI printed "Approved: 0" forever
        name: 'governance stats prints real counters (#173)',
        bin: 'governance.js', args: ['stats'], exit: 0,
        match: [/Governance Stats:/, /Total decisions:\s*\d+/]
    },
    {
        name: 'governance list exits 0, prints records not undefined (#173)',
        bin: 'governance.js', args: ['list'], exit: 0,
        notMatch: ['undefined', 'TypeError']
    },

    // ---- forum (#172 class: publish→list→view round trip) ------------------
    {
        name: 'forum --help shows list/post/view verbs',
        bin: 'forum.js', args: ['--help'], exit: 0,
        match: [/forum list/, /forum post <title>/, /forum view <barcode>/]
    },
    {
        name: 'forum list exits 0 (bang on lib/board)',
        bin: 'forum.js', args: ['list'], exit: 0,
        notMatch: ['TypeError', 'is not a function']
    },

    // ---- horcrux ------------------------------------------------------------
    {
        name: 'horcrux --help documents create/inspect/restore',
        bin: 'horcrux.js', args: ['--help'], exit: 0,
        match: [/create/, /inspect/, /restore/]
    },
    {   // create without a path/mate exits nonzero and tells you how
        name: 'horcrux create missing args exits nonzero with usage',
        bin: 'horcrux.js', args: ['create'], exit: 1,
        match: [/usage/i]
    },

    // ---- core doors ---------------------------------------------------------
    {
        name: 'health exits 0 (diagnostics run)',
        bin: 'health.js', args: [], exit: 0
    },
    {
        name: 'vant version reports 0.8.6',
        bin: 'vant.js', args: ['version'], exit: 0,
        match: [/0\.8\.6/]
    },
    {
        name: 'help exits 0 with the command index',
        bin: 'help.js', args: [], exit: 0,
        match: [/Usage/]
    },

    // ---- era / trace / event doors (#178-era additions) ---------------------
    {
        name: 'era --help shows start/current/close',
        bin: 'era.js', args: ['--help'], exit: 0,
        match: [/era start <intent>/, /era close/]
    },
    {
        name: 'era current exits 0 (typed absence allowed)',
        bin: 'era.js', args: ['current'], exit: 0
    },
    {
        name: 'trace renders empty ledger once instead of crashing',
        bin: 'trace.js', args: [], exit: 0,
        match: [/no spans|trace/i]
    },

    // ---- memory / search / escrow / nodes / backup ---------------------------
    {
        name: 'memory --help shows learn/query roundtrip verbs',
        bin: 'memory.js', args: ['--help'], exit: 0,
        match: [/learn <key>/, /query <key>/]
    },
    {
        name: 'search --help shows the query door',
        bin: 'search.js', args: ['--help'], exit: 0,
        match: [/search|Usage/i]
    },
    {
        name: 'escrow --help shows hold/release/status',
        bin: 'escrow.js', args: ['--help'], exit: 0,
        match: [/escrow status/, /escrow hold <id>/, /escrow release <id>/]
    },
    {
        name: 'nodes --help shows list/register/ping verbs',
        bin: 'nodes.js', args: ['--help'], exit: 0,
        match: [/nodes list/, /nodes register/, /nodes ping <node>/]
    },
    {
        name: 'backup --help shows create/list/restore verbs',
        bin: 'backup.js', args: ['--help'], exit: 0,
        match: [/backup create/, /backup list/]
    },
];

module.exports = { PINS };

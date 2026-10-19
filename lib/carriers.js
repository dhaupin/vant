/**
 * Vant Carriers — the assimilator pack (pass 258).
 *
 * The owner's framing (prd-automation.md / nsc9-spec.md, recorded in this
 * repo's own docs): the traveler (lib/traveler.js) is the ROUTER OBJECT —
 * the invariant; the carrier is a LOCAL INTERFACE. The same packet rides
 * different carriers per hop depending on what the physical world demands:
 * a scanner fleet reads digits, an airgapped lane carries a stone, an ERP
 * ingests JSON. This lib is the carrier side of that contract:
 *
 *   encode(t, carrier, opts) -> carrier artifact   (the packet assimilated)
 *   decode(carrier, artifact) -> the packet        (verify re-applied)
 *   replay(arrivals) -> continuity report           (continuity + backtracking)
 *
 * WHAT A CARRIER IS ALLOWED TO CARRY, LAWS:
 *
 *   1. THE PACKET IS THE INVARIANT. Carriers never re-shape, re-scope, or
 *      "fix" a traveler; they carry it verbatim (stone/svg/json) or point
 *      AT it (nsc9). A carrier decode re-checks the packet with the
 *      traveler lib's own verify (law 4) — a carrier that arrives with a
 *      packet whose address does not derive is refused, never re-written.
 *   2. VERIFY AT EVERY LANDING — INCLUDING SENDERS. encode refuses to
 *      carry a tampered packet; the wall stays loud at BOTH ends.
 *   3. CONTINUITY IS A REPORT, NEVER A REPAIR. replay() walks carried
 *      landings of one lineage and reports gaps and rewritten steps as a
 *      typed backtrack map — it never reconstructs or re-addresses history. *      4. TYPED REFUSAL, NOT SILENCE: every malformed input is a typed
 *      E_CARRIER_* VantError (the lib zero-raw-throw law). A lane that
 *      physically cannot carry the bytes yet (qr, png) stays EXPLICITLY
 *      ABSENT — the roster names its own holes, nothing pretends.
 *
 * pass 260 — THE TEMPLATE (super flex parts, super strict order): a route
 * may carry a TEMPLATE — the bill of stations defined up front ({ by?, op?,
 * part?, carrier? }[]). carry() enforces the letter's stations follow the
 * bill IN ORDER: each template row is matched against the caller's station
 * for that stage (by/op declared before the run), the letter is still built
 * station by station with real parts, and a skipped row, a reordered
 * stage, or an unplanned station refuses typed E_CARRIER_TEMPLATE.
 * Compliance lives in the TEMPLATE (what MUST happen); flexibility lives
 * in the caller (WHO runs each stage and WITH WHICH parts/params, plus
 * template-wildcard rows by/op:'*' that admit any station's choice).
 *
 * THE CERTIFIED-LETTER PRINCIPLE (pass 259, a core enterprise posture —
 * opt-in for every other user): a packet that ROUTES is a certified
 * letter. Each stage of the route performs, with the OS that already
 * exists (no new surfaces, lazy where heavy):
 *      CHECK  — the scope lineage gate (traveler.scopeCheck inside advance)
 *      RISK   — the escrow approval lane for privileged hops
 *               (traveler.approvalFor: single-use Approval burn, the #204 law)
 *      AUDIT  — the shared event bus + the audit trail at every stage
 *   A refused stage DROPS THE PACKET (fail-closed): the route report
 *   carries the typed refusal, and replay() certifies exactly where the
 *   continuity record stops. Routing without stages is not a letter.
 *   carry(t, { stations }) is the one-call shape; the walk at the end is
 *   the auditor's copy of the route.
 *
 * CARRIER ROSTER AT THIS PASS (truth-state, per line):
 *   nsc9       Lane B numeric address carrier (the spec's deterministic
 *              12-digit frame) + the Lane A GIAI (AI 8004) read-through.
 *              POINTER lane: 12 digits carry the ADDRESS, not the payload.
 *   stone      Full-packet text carrier: carrier-addressed envelope with
 *              its own integrity seal, so CARRIER corruption and PACKET
 *              tamper refuse on DIFFERENT walls.
 *   svg        The stone packet driven through lib/stego's encrypted-stone
 *              lane (encodeSvg/decodeSvg) — the visual/airgap interface the
 *              horcrux already uses. Encrypted by law: without an explicit
 *              password one is minted crypto-randomly and handed back ONCE
 *              (the genesis pair-secret pattern).
 *   json       The ERP/EPCIS form: the traveler object verbatim. Zero
 *              transformation IS the honest behavior — an ERP that ingests
 *              unit-serial identity reads the SAME object every other lane
 *              carries.
 *   qr/png     DECLARED-ABSENT: the symbology/raster renderers live outside
 *              the dependency contract today. list() prints the absence
 *              with its blocker; encode/decode refuse typed. They re-open
 *              when a renderer lands — nothing else changes.
 *
 * Relationship to lib/stego.js: stego IS the low-level visual codec
 * (password stones, PNG/SVG embed); carriers are the WORKFLOW layer over it
 * — the packet, the address, the ledger laws, and the continuity report.
 *
 * Relationship to lib/traveler.js: carriers never bypass the traveler's
 * laws; every carrier composition re-enters shapeRefusalFor()/verify().
 */

'use strict';

const crypto = require('crypto');
// (pass 259, hash-canon gate) digests ride the ONE hashing surface (lib/hash);
// `crypto` stays only for the pair-secret randomBytes in the svg lane and
// the QR-PNG's own pixel building (no hashing).
const hashLib = require('./hash');

const vaf = require('./vaf');
const errors = require('./error');
const traveler = require('./traveler');
const stego = require('./stego');

const CARRIER_VERSION = 'cr/1';                     // carrier socket generation
const STONE_FRAME_FORMAT = 'stone/1';               // full-packet frame generation
// The stone lane carries a base64 envelope inline (QR/printable/context sizes
// are all SMALLER than the r/2 state ceiling it borrows; the mesh/pod lane
// stays the carrier for anything above it — named, not silently truncated).
const STONE_MAX_CTEXT = 262144;                     // 256 KiB of base64 text
// QR lane caps: the symbology's byte-mode ceiling is ~2953 bytes at level L,
// and the stone envelope (packet + seal overhead) must fit INSIDE it. The
// QR lane also emits a raster PNG artifact — its own cap sits above the
// stone's (the matrix is where the ceiling actually binds).
const QR_MAX_CTEXT = 2500;                          // QR byte-mode payload cap (level L kept honest)
const QR_SCALE = 4;                                 // PNG pixel scale (modules -> px)
const QR_MARGIN = 4;                                // PNG quiet zone (modules)

const CODES = {
    SHAPE: 'E_CARRIER_SHAPE',       // not a packet/frame the carrier speaks
    CARRIER: 'E_CARRIER_CARRIER',   // unknown carrier id / absent lane / future socket
    TAMPER: 'E_CARRIER_TAMPER',     // carrier seal mismatch or packet-mismatch
    GAP: 'E_CARRIER_GAP',           // continuity: ledger landings stop dead
    REWRITE: 'E_CARRIER_REWRITE',   // continuity: an already-walked seq re-arrives with different content
    TEMPLATE: 'E_CARRIER_TEMPLATE'  // the route deviates from its bill of stations (order/skip/extra)
};

// ==================== HOUSE HELPERS (the traveler's patterns) ====================

/** Shared-event-bus emit (the lib's lazy pattern; audibility never blocks). */
let _event = null;
function _emit(event, data) {
    if (!_event) {
        try { _event = require('./event'); } catch (e) { return; }
    }
    if (_event && typeof _event.emit === 'function') {
        try { _event.emit(event, data); } catch (e) { /* never blocks */ }
    }
}

function _auditLine(line) {
    try { require('./audit').info(line); } catch (e) { /* audit adjacency, never a gate */ }
}

function coded(code, message) {
    return new errors.VantError(message, { code, retryable: false });
}

/** vaf-validated caller strings (uniform refusal; absent passes through).
 *  `opts.allowContent` is the vaf-blessed lane for content artifacts (the
 *  same flag memory content uses): closing tags/multiline are the artifact's
 *  own body, not an injection attempt — the path-traversal wall still runs
 *  on every string, artifact or not. */function _vafStr(value, name, max, opts) {    if (value === undefined || value === null || value === '') return value;    const s = String(value);    const options = { type: 'string', name: 'carrier:' + name, maxLength: max };    if (opts && opts.allowContent) options.allowContent = true;    vaf.check(s, options);    return s;}/** * The VISUAL-ARTIFACT string scan (svg carrier): NUL bytes, C1 controls, * and length are refused typed. Full vaf.check cannot sit on an SVG * artifact body BY CONSTRUCTION — the percent-sign of canonical attributes * (width="100%") and the closing-tag syntax are intrinsic to SVG and misread * as hostile percent-encoding/content by the otherwise-correct wall, while * the deliberately unexposed vaf blob-bypass is not our lane to reach through. The artifact's real downstream sinks are the stego regexes and * the base64/JSON packet decode — no path, no shell, no command — and the * packet re-enters the full traveler law (shape + verify) the moment it is * extracted, so the artifact body itself stays integrity-irrelevant. */function _artifactStr(value, name, max) {
    if (typeof value !== 'string' || !value || !value.includes('<')) {
        throw coded(CODES.SHAPE, 'the ' + name + ' lane expects the SVG artifact text.');
    }
    return _carrierStr(value, name, max, 'svg');
}

/**
 * (pass 262) THE FRAMED-ARTIFACT string scan — the shared law for every
 * content artifact (svg stones, plates, any future lane): NUL bytes, C0/
 * C1 controls, and length are refused typed, nothing else syntactic.
 * Full vaf.check collides with artifact BODIES by construction (the stone
 * grammar's own punctuation and innocent base64 byte runs read as paths or
 * event attributes to a path wall), and the artifact's real downstream
 * sinks are the frame/string regexes and the sealed decode — the packet
 * re-enters the FULL traveler law the moment it is extracted.
 * @param {string} value  the artifact text
 * @param {string} name   the lane's display name (refusal wording)
 * @param {number} max    the artifact ceiling in chars
 * @param {string} carrierId  the lane id (audit/event attribution)
 */
function _carrierStr(value, name, max, carrierId) {
    if (typeof value !== 'string' || !value.length) {
        throw coded(CODES.SHAPE, 'the ' + name + ' lane expects the artifact text.');
    }
    if (value.length > max) {
        _emit('carrier:refused', { carrier: carrierId, why: 'artifact-cap' });
        throw coded(CODES.SHAPE, 'ARTIFACT_CAP: ' + name + ' exceeds ' + max + ' chars.');
    }
    for (const ch of value) {
        const cp = ch.codePointAt(0);
        if (cp === 0 || (cp >= 1 && cp <= 8) || cp === 11 || cp === 12 || (cp >= 14 && cp <= 31) || (cp >= 127 && cp <= 159)) {
            _emit('carrier:refused', { carrier: carrierId, why: 'artifact-control-byte' });
            throw coded(CODES.SHAPE, 'the ' + name + ' artifact carries a control byte — refuse, never repair.');
        }
    }
    return value;
}

/** The packet gate every carrier composition uses: shape law, then verify. */
function _packetOrThrow(t, forWho) {
    const shape = traveler.shapeRefusalFor(t);
    if (shape) {
        _emit('carrier:refused', { carrier: forWho, why: 'shape', code: shape.code });
        throw coded(CODES.SHAPE, 'the ' + forWho + ' lane requires a shape-legal traveler: ' + shape.message);
    }
    const v = traveler.verify(t);
    if (!v.ok) {
        // verify at every landing — INCLUDING THE SENDER (law 2).
        _emit('carrier:refused', { carrier: forWho, why: 'address', id: t.id });
        throw coded(CODES.TAMPER, 'the ' + forWho + ' lane refuses to carry a packet whose address does not derive (' + v.error + ').');
    }
}

/** The registry: id -> carrier (frozen at registration). */
const _registry = Object.create(null);

function _register(carrier) {
    for (const key of ['id', 'generation', 'family', 'carries', 'encode', 'decode', 'note']) {
        if (carrier[key] === undefined) {
            throw coded(CODES.CARRIER, 'a carrier registration is incomplete: missing `' + key + '` — the roster never carries half-laws.');
        }
    }
    _registry[carrier.id] = Object.freeze(carrier);
    return carrier;
}

// ==================== NSC-9 — the address carrier (Lane B numeric) ====================
// The frame is the spec's own deterministic derivation (docs/advanced/
// nsc9-spec.md): 9-FACILITY(5 digits)-SEQUENCE(5)-CHECK(1), all derived from
// the traveler's content address. Self-authenticating: a receiving station
// re-derives from the packet it holds and compares (matches()). It is a
// POINTER lane; the packet itself follows via mesh/pod/stone. Lossy by
// design, honestly named.

const NSC9_FRAME_RE = /^9-([0-9]{5})-([0-9]{5})-([0-9])$/;

function _nsc9FrameFromId(id) {
    const facility = 10000 + (parseInt(id.slice(0, 5), 16) % 90000);
    const sequence = parseInt(id.slice(5, 10), 16) % 100000;
    const checksum = parseInt(id.slice(-1), 16) % 10;
    return '9-' + facility + '-' + String(sequence).padStart(5, '0') + '-' + checksum;
}

const nsc9 = {
    id: 'nsc9',
    generation: CARRIER_VERSION,
    family: 'address',
    carries: 'id-pointer',
    note: 'Lane B raw 12-digit frame (Code128/EAN13-family scannable); Lane A read-through via giai()/fromGiai() (AI 8004).',
    encode(t) {
        _packetOrThrow(t, 'nsc9');
        const frame = _nsc9FrameFromId(t.id);
        _auditLine('[Carrier nsc9] framed ' + t.id.slice(0, 12) + ' -> ' + frame);
        _emit('carrier:encoded', { carrier: 'nsc9', kind: 'address', frame, id: t.id });
        return { carrier: nsc9.id, v: nsc9.generation, kind: 'address', frame, id: t.id };
    },
    decode(frame) {
        const f = _vafStr(frame, 'nsc9-frame', 40);
        if (typeof f !== 'string') {
            throw coded(CODES.SHAPE, 'nsc9.decode expects the 12-digit frame string.');
        }
        const m = NSC9_FRAME_RE.exec(f.trim());
        if (!m) {
            _emit('carrier:refused', { carrier: 'nsc9', why: 'shape' });
            throw coded(CODES.SHAPE, 'not an NSC-9 frame (9-FACILITY-SEQUENCE-CHECK, 12 digits) — the reader refuses, never re-derives.');
        }
        _emit('carrier:decoded', { carrier: 'nsc9', kind: 'address', frame: f.trim() });
        return {
            carrier: nsc9.id,
            v: nsc9.generation,
            kind: 'address',
            facility: Number(m[1]),
            sequence: Number(m[2]),
            checksum: Number(m[3]),
            // Route the mark into the store layout the spec names:
            // data/{first2}/{FACILITY_SEQUENCE_CHECK}.json
            storageKey: m[1] + '_' + m[2] + '_' + m[3]
        };
    },
    /**
     * The self-authentication hand (the carrier's whole point in industrial
     * use): does the packet the station holds PROVE this scanned mark?
     * A malformed PACKET or FRAME refuses typed; a legal pair that does not
     * attest is boolean false — 8.5.2 distinguishes a broken wall from a
     * wrong part.
     */
    matches(frame, t) {
        const f = _vafStr(frame, 'nsc9-frame', 40);
        if (typeof f !== 'string') {
            throw coded(CODES.SHAPE, 'not an NSC-9 frame (9-FACILITY-SEQUENCE-CHECK, 12 digits).');
        }
        if (!NSC9_FRAME_RE.test(f.trim())) {
            throw coded(CODES.SHAPE, 'not an NSC-9 frame (9-FACILITY-SEQUENCE-CHECK, 12 digits).');
        }
        _packetOrThrow(t, 'nsc9');
        return f.trim() === _nsc9FrameFromId(t.id);
    },
    /** Lane A: the GS1 front door — the frame value as AI (8004) GIAI text. */
    giai(t) {
        _packetOrThrow(t, 'nsc9');
        return '(8004)' + _nsc9FrameFromId(t.id).replace(/-/g, '');
    },
    /** Strip the GS1 wrapper back to the raw frame (the fleet read-through). */
    fromGiai(s) {
        const v = _vafStr(s, 'giai', 40);
        if (typeof v !== 'string') {
            throw coded(CODES.SHAPE, 'fromGiai expects the GS1 text, e.g. `(8004)9NNNNNNNNNNC`.');
        }
        const m = /^\(8004\)(9\d{11})$/.exec(v.trim());
        if (!m) {
            throw coded(CODES.SHAPE, 'not an AI-8004 GIAI value: ' + JSON.stringify(v.slice(0, 24)) + ' — the fleet lane refuses, never guesses.');
        }
        const d = m[1];
        return '9-' + d.slice(1, 6) + '-' + d.slice(6, 11) + '-' + d.slice(11, 12);
    }
};

// ==================== STONE — the full-packet text carrier ====================
// The deck to the boot-stone JSON form: a carrier-addressed envelope that
// carries the ENTIRE packet. Its seal is over the CARRIER bytes; the packet
// keeps the traveler's own address law. Two different walls never confuse
// "the lane damaged bytes" with "someone edited history".

function _stoneSeal(ctext) {
    return hashLib.sha256('stone|' + ctext, 'utf8');
}/** * True when s carries a control byte (NUL, C0 controls, DEL, C1) — the * crafted-literal rule bannies them from regex classes (no-control-regex), * and a code-point scan says exactly why they are wanted: a seal or a * base64 body NEVER legitimately carries one. */function hasControlByte(s) {    for (const ch of s) {        const cp = ch.codePointAt(0);        if (cp === 0 || (cp >= 1 && cp <= 31) || (cp >= 127 && cp <= 159)) return true;    }    return false;}/** * The stone/1 envelope frame: `VSTN:1:<seal>:<ctext>`. Colons are the
 * separator BY INTENT: base64's alphabet carries no colon, so the frame
 * stays unambiguous, and — home-expansion (`~`), drive/backtick, and
 * dot-dot (`..`) alike misread as paths by the vaf wall — the plain colon
 * frame passes vaf.check legitimately (the packet was never a path). The
 * seal is a sha256 over the exact ctext bytes (the CARRIER wall); the
 * packet inside keeps the traveler's own address law (the PACKET wall).
 */
const STONE_ENVELOPE_PREFIX = 'VSTN:1:';

const stone = {
    id: 'stone',
    generation: CARRIER_VERSION,
    family: 'packet',
    carries: 'full-object',
    note: 'Carrier-addressed text envelope; < ' + STONE_MAX_CTEXT + ' base64 chars. Above the ceiling the lane is the mesh/pod, by name (STONE_CAP).',
    encode(t) {
        _packetOrThrow(t, 'stone');
        const ctext = Buffer.from(JSON.stringify(t), 'utf8').toString('base64');
        if (ctext.length > STONE_MAX_CTEXT) {
            _emit('carrier:refused', { carrier: 'stone', why: 'capacity', id: t.id });
            throw coded(CODES.SHAPE, 'STONE_CAP: the packet does not fit the ' + STONE_MAX_CTEXT + '-char stone lane (' + ctext.length + ' required) — carry it on the mesh/pod lane, or chunk at the caller.');
        }
        const envelope = STONE_ENVELOPE_PREFIX + _stoneSeal(ctext) + ':' + ctext;
        _auditLine('[Carrier stone] sealed ' + t.id.slice(0, 12) + ' seq ' + t.seq + ' (' + ctext.length + ' chars)');
        _emit('carrier:encoded', { carrier: 'stone', kind: 'packet', id: t.id, seq: t.seq });
        return { carrier: stone.id, v: stone.generation, kind: 'packet', envelope, id: t.id, seq: t.seq };
    },
    decode(envelope) {
        // The envelope is a CONTENT ARTIFACT, not a caller target: full
        // vaf.check pattern-scans collide with ordinary base64 (a flipped
        // byte that reads "...on5=A..." blocks as an HTML event attribute).
        // The STRICTER grammar wall below (prefix + hex seal + base64-only
        // ctext + cap) accepts only exactly what encode() emits and refuses
        // everything else typed — including every traversal/injection
        // shape (dots, colons-in-body, control bytes are all off-alphabet).
        const e = envelope;
        if (typeof e !== 'string' || e.length < 12 || e.length > STONE_MAX_CTEXT + 80) {
            _emit('carrier:refused', { carrier: 'stone', why: 'shape' });
            throw coded(CODES.SHAPE, 'not a stone/1 envelope (VSTN:1:<seal>:<ctext>) — refuse, never repair.');
        }
        const parts = e.split(':');
        if (parts.length !== 4 || parts[0] !== 'VSTN' || parts[1] !== '1') {
            _emit('carrier:refused', { carrier: 'stone', why: 'shape' });
            throw coded(CODES.SHAPE, 'not a stone/1 envelope (VSTN:1:<seal>:<ctext>) — refuse, never repair.');
        }
        const seal = parts[2];
        const ctext = parts[3];        if (!/^[0-9a-f]{64}$/.test(seal) || !/^[A-Za-z0-9+/]+={0,2}$/.test(ctext) || hasControlByte(e)) {            _emit('carrier:refused', { carrier: 'stone', why: 'grammar' });            throw coded(CODES.SHAPE, 'the envelope fails the stone grammar (hex seal, base64 body, no control bytes) — refuse, never repair.');
        }
        if (seal !== _stoneSeal(ctext)) {
            _emit('carrier:refused', { carrier: 'stone', why: 'seal', seal: seal.slice(0, 8) });
            // The CARRIER wall: bytes damaged in transit. Distinct from the
            // PACKET wall (the address law inside the traveler).
            throw coded(CODES.TAMPER, 'the stone carrier seal does not match its bytes — the lane damaged the carrier, not history. Re-issue the artifact.');
        }
        let t;
        try { t = JSON.parse(Buffer.from(ctext, 'base64').toString('utf8')); }
        catch (err) {
            _emit('carrier:refused', { carrier: 'stone', why: 'unparseable' });
            throw coded(CODES.TAMPER, 'the stone payload does not parse into a packet (' + err.message + ') — refuse, never repair.');
        }
        // Verify at every landing — the packet re-enters the traveler law.
        _packetOrThrow(t, 'stone');
        _auditLine('[Carrier stone] landed ' + t.id.slice(0, 12) + ' seq ' + t.seq);
        _emit('carrier:decoded', { carrier: 'stone', kind: 'packet', id: t.id, seq: t.seq });
        return { carrier: stone.id, v: stone.generation, kind: 'packet', traveler: t, seq: t.seq };
    }
};

// ==================== SVG — the encrypted-stone visual interface ====================
// lib/stego owns the codec; the carrier owns the workflow law: the packet
// goes in as a stone ENVELOPE (so decode composes stone.decode after
// unsealing), the stone is ENCRYPTED (the stego lane's own encrypted-only
// posture), and an unattended caller still gets a stone by the genesis
// pattern — a crypto-random password handed back ONCE.

const svgCarrier = {
    id: 'svg',
    generation: CARRIER_VERSION,
    family: 'visual',
    carries: 'full-object',
    note: 'Encrypted stego stone (lib/stego.encodeSvg/decodeSvg) over the stone envelope. Password explicit, or minted once per encode.',
    encode(t, opts) {
        const o = opts || {};
        _packetOrThrow(t, 'svg');
        const sealed = stone.encode(t).envelope;   // the invariant frame rides inside
        let skeleton = '<svg width="420" height="110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="vant router stone">' +
            '<rect width="100%" height="100%" fill="#0b0e14"/>' +
            '<text x="16" y="34" fill="#7fd1c6" font-family="monospace" font-size="15">VANT ROUTER STONE (cr/1)</text>' +
            '<text x="16" y="62" fill="#e2e8f0" font-family="monospace" font-size="11">id ' + t.id.slice(0, 12) + ' seq ' + t.seq + ' (' + t.tr + ')</text>' +
            '<text x="16" y="86" fill="#5b6478" font-family="monospace" font-size="10">packet embedded as an encrypted brn:secret stone</text>' +
            '</svg>';        if (typeof o.skeleton === 'string' && o.skeleton.includes('</svg>')) {            skeleton = _artifactStr(o.skeleton, 'caller svg skeleton', STONE_MAX_CTEXT);        }
        // The pair-secret: explicit password honored; otherwise minted. Either
        // way the stone crosses the gap ENCRYPTED — the unattended airgap lane
        // stays honest by RETURNING the secret once, not by sending plaintext.
        let password = null;
        let minted = true;
        if (typeof o.password === 'string' && o.password) {
            password = _vafStr(o.password, 'svg-password', 200);
            minted = false;
        } else {
            password = crypto.randomBytes(18).toString('hex');
        }
        const artifact = stego.encodeSvg(sealed, skeleton, password);
        _auditLine('[Carrier svg] embedded stone for ' + t.id.slice(0, 12) + ' seq ' + t.seq + (minted ? ' (minted pair password)' : ' (caller password)'));
        _emit('carrier:encoded', { carrier: 'svg', kind: 'visual', id: t.id, seq: t.seq, encrypted: true });
        const out = { carrier: svgCarrier.id, v: svgCarrier.generation, kind: 'visual', encrypted: true, svg: artifact };
        if (minted) out.stonePassword = password;   // handed ONCE; carry out-of-band
        return out;
    },    decode(svgContent, password) {        // artifact content scan (see _artifactStr: full vaf cannot sit on svg        // bodies by construction; the sink analysis is in its doc block).        const s = _artifactStr(svgContent, 'svg stone', STONE_MAX_CTEXT + 2048);
        if (typeof s !== 'string') {
            throw coded(CODES.SHAPE, 'svg.decode expects the SVG (stone) text.');
        }
        const stegoOut = stego.decodeSvg(s, typeof password === 'string' ? password : null);
        if (!stegoOut || stegoOut.error || !stegoOut.message) {
            const reason = (stegoOut && stegoOut.error) || 'no brn:secret stone found';
            _emit('carrier:refused', { carrier: 'svg', why: 'stego', reason });
            throw coded(CODES.TAMPER, 'the svg stone refuses to open (' + reason + ') — the airgap lane stays encrypted; re-issue with the pair password.');
        }
        // Unseal, then the stone lane's own decode re-applies seal + packet laws.
        return stone.decode(stegoOut.message);
    }
};

// ==================== JSON — the ERP/EPCIS form ====================
// Zero transformation IS the behavior: an ERP ingesting unit-serial identity
// reads exactly the object every other lane carries. The carrier's job on
// both ends: shape law + verify, typed refusals so a hostile "JSON" is never
// silently ingested.

const jsonCarrier = {
    id: 'json',
    generation: CARRIER_VERSION,
    family: 'packet',
    carries: 'full-object',
    note: 'The traveler object verbatim (the ERP/EPCIS form); verify applied at both ends.',
    encode(t) {
        _packetOrThrow(t, 'json');
        _auditLine('[Carrier json] handed ' + t.id.slice(0, 12) + ' seq ' + t.seq + ' (ERP/EPCIS form, verbatim)');
        _emit('carrier:encoded', { carrier: 'json', kind: 'packet', id: t.id, seq: t.seq });
        return { carrier: jsonCarrier.id, v: jsonCarrier.generation, kind: 'packet', json: JSON.parse(JSON.stringify(t)), id: t.id, seq: t.seq };
    },
    decode(bag) {
        _packetOrThrow(bag, 'json');
        _auditLine('[Carrier json] received ' + bag.id.slice(0, 12) + ' seq ' + bag.seq + ' (verified)');
        _emit('carrier:decoded', { carrier: 'json', kind: 'packet', id: bag.id, seq: bag.seq });
        return { carrier: jsonCarrier.id, v: jsonCarrier.generation, kind: 'packet', traveler: bag, seq: bag.seq };
    }
};

// ==================== QR — the symbology lane (pass 264) ====================
// The declared-absent lane is REAL now: the dependency contract grows by
// exactly two pure-JS packages (qrcode-generator = render, jsqr = read),
// both scanner-interop — a real handheld camera reads what this emits. The
// packet rides as the STONE ENVELOPE (the invariant frame), rendered to a
// PNG the lib emits itself (zlib, no canvas dependency), and the raster
// round-trips through a REAL symbology decoder — not a self-confirmation
// loop. The stone walls (seal + packet address) re-apply inside stone.decode.

function _pngPixels(matrix, scale, margin) {
    const n = matrix.getModuleCount();
    const size = (n + margin * 2) * scale;
    const px = Buffer.alloc(size * size, 255);
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (!matrix.isDark(r, c)) continue;
            for (let dy = 0; dy < scale; dy++) {
                const y = (r + margin) * scale + dy;
                const row = y * size + (c + margin) * scale;
                px.fill(0, row, row + scale);
            }
        }
    }
    return { px, size };
}

function _pngEncode(px, size) {
    let table = _pngEncode._crc;
    if (!table) {
        table = _pngEncode._crc = new Int32Array(256);
        for (let k = 0; k < 256; k++) {
            let c = k;
            for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[k] = c;
        }
    }
    const crc32 = (buf) => {
        let crc = -1;
        for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xFF];
        return (crc ^ -1) >>> 0;
    };
    const chunk = (type, data) => {
        const t = Buffer.from(type, 'ascii');
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
        return Buffer.concat([len, t, data, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;                 // bit depth
    ihdr[9] = 0;                 // color type: grayscale
    const raw = Buffer.alloc(size * (size + 1));
    for (let y = 0; y < size; y++) {
        raw[y * (size + 1)] = 0; // filter: none
        px.copy(raw, y * (size + 1) + 1, y * size, (y + 1) * size);
    }
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
        chunk('IHDR', ihdr),
        chunk('IDAT', require('zlib').deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function _qrMatrix(payload) {
    const qrLib = require('qrcode-generator');
    const m = qrLib(0, 'L');
    m.addData(payload, 'Byte');
    m.make();
    return m;
}

const qrCarrier = {
    id: 'qr',
    generation: CARRIER_VERSION,
    family: 'symbology',
    carries: 'full-object',
    note: 'Real symbology lane (qrcode-generator + jsqr): AUTO-DECTECT marks — the stone envelope (full packet) or the extended vant frame VANT:1:<64-hex address> (pointer, resolves to the persisted packet body; a miss returns the pure pointer). One lane, both forms.',
    encode(t, opts) {
        const o = opts || {};
        _packetOrThrow(t, 'qr');
        // (pass 265) POINTER MODE: the extended vant frame rides the QR —
        // the FULL 64-hex content address (the lattice-scale identity the
        // 12-digit NSC-9 doorway cannot hold), NOT the packet. Same
        // self-authentication law as nsc9: the mark derives from the id.
        if (o.pointer === true) {
            const frame = _qPointerFrame(t.id);
            const matrix = _qrMatrix(frame);
            const { px, size } = _pngPixels(matrix, QR_SCALE, QR_MARGIN);
            const png = _pngEncode(px, size);
            _auditLine('[Carrier qr] framed pointer ' + t.id.slice(0, 12) + ' (' + matrix.getModuleCount() + ' modules)');
            _emit('carrier:encoded', { carrier: 'qr', kind: 'pointer', id: t.id });
            return { carrier: qrCarrier.id, v: qrCarrier.generation, kind: 'pointer', frame, moduleCount: matrix.getModuleCount(), png, id: t.id };
        }
        const sealed = stone.encode(t).envelope;   // the invariant frame rides inside the QR
        if (sealed.length > QR_MAX_CTEXT) {
            _emit('carrier:refused', { carrier: 'qr', why: 'capacity', id: t.id });
            throw coded(CODES.SHAPE, 'QR_CAP: the stone envelope does not fit this lane (' + sealed.length + ' > ' + QR_MAX_CTEXT + ' chars, the QR byte-mode ceiling) — carry it on the stone lane, or chunk at the caller.');
        }
        const matrix = _qrMatrix(sealed);
        const { px, size } = _pngPixels(matrix, QR_SCALE, QR_MARGIN);
        const png = _pngEncode(px, size);
        _auditLine('[Carrier qr] rendered ' + t.id.slice(0, 12) + ' seq ' + t.seq + ' (' + matrix.getModuleCount() + ' modules, ' + png.length + ' B png)');
        _emit('carrier:encoded', { carrier: 'qr', kind: 'symbology', id: t.id, seq: t.seq });
        return { carrier: qrCarrier.id, v: qrCarrier.generation, kind: 'symbology', moduleCount: matrix.getModuleCount(), png, envelope: sealed, id: t.id, seq: t.seq };
    },
    decode(pngBuffer, opts) {
        const o = opts || {};
        if (!Buffer.isBuffer(pngBuffer)) {
            throw coded(CODES.SHAPE, 'qr.decode expects the PNG buffer the lane emitted.');
        }
        // The raster gate: the artifact must be a square grayscale PNG of the
        // lane's own emission shape. Hostile/truncated buffers refuse typed
        // BEFORE any pixel is touched.
        if (pngBuffer.length < 57 || pngBuffer.slice(1, 4).toString('ascii') !== 'PNG') {
            _emit('carrier:refused', { carrier: 'qr', why: 'shape' });
            throw coded(CODES.SHAPE, 'not a QR PNG (the lane expects its own raster emission) — refuse, never repair.');
        }
        const width = pngBuffer.readUInt32BE(16);
        const height = pngBuffer.readUInt32BE(20);
        if (width === 0 || width !== height) {
            throw coded(CODES.SHAPE, 'not a QR PNG (non-square raster ' + width + 'x' + height + ') — refuse, never repair.');
        }
        // Extract the IDAT chunk(s) (the lane emits exactly one).
        const zlib = require('zlib');
        const idats = [];
        let off = 8;
        while (off + 8 <= pngBuffer.length) {
            const len = pngBuffer.readUInt32BE(off);
            const type = pngBuffer.slice(off + 4, off + 8).toString('ascii');
            if (type === 'IDAT') idats.push(pngBuffer.slice(off + 8, off + 8 + len));
            if (type === 'IEND') break;
            off += 12 + len;
        }
        if (!idats.length) {
            throw coded(CODES.SHAPE, 'no IDAT chunk in the raster — refuse, never repair.');
        }
        let raw;
        try { raw = zlib.inflateSync(Buffer.concat(idats)); } catch (e) {
            throw coded(CODES.TAMPER, 'the raster does not inflate (' + e.message + ') — refuse, never repair.');
        }
        const stride = width + 1;   // 8-bit grayscale + filter byte per row
        if (raw.length < height * stride) {
            throw coded(CODES.SHAPE, 'raster rows do not fill the frame — refuse, never repair.');
        }
        for (let y = 0; y < height; y++) {
            const filter = raw[y * stride];
            if (filter !== 0) {
                throw coded(CODES.SHAPE, 'raster filter byte ' + filter + ' — the lane emits filter-none; a foreign artifact refuses typed.');
            }
        }
        // THE REAL READER: jsqr re-reads the mark FROM the handed bytes — the
        // lib never trusts what it just rendered. A damaged raster fails the
        // decode typed (the carrier wall); a decoded mark re-enters stone
        // decode (the seal + packet walls).
        const jsqr = require('jsqr');
        const rgba = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            const rowOff = y * stride + 1;
            for (let x = 0; x < width; x++) {
                const v = raw[rowOff + x];
                const i = (y * width + x) * 4;
                rgba[i] = v; rgba[i + 1] = v; rgba[i + 2] = v; rgba[i + 3] = 255;
            }
        }
        const hit = jsqr(rgba, width, height);
        if (!hit || !hit.data || typeof hit.data !== 'string') {
            _emit('carrier:refused', { carrier: 'qr', why: 'no-decode' });
            throw coded(CODES.TAMPER, 'the raster does not decode to a QR mark — carrier damage refuses typed; re-issue the artifact.');
        }
        _emit('carrier:decoded', { carrier: 'qr', kind: 'symbology', id: hit.data.slice(0, 12) });
        // (pass 265) AUTO-DETECT: one lane, two mark grammars. A decoded
        // string that names the stone grammar rides the packet path; a
        // string that names the extended vant frame rides the POINTER path
        // (option: pure pointer without the resolve read); anything else
        // is foreign traffic — refuse typed, never guess.
        if (hit.data.startsWith(POINTER_FRAME_PREFIX)) {
            return _qPointerDecode(hit.data, o);
        }
        if (!hit.data.startsWith('VSTN:')) {
            _emit('carrier:refused', { carrier: 'qr', why: 'foreign-mark' });
            throw coded(CODES.SHAPE, 'the decoded mark speaks neither lane grammar (stone VSTN: or pointer ' + POINTER_FRAME_PREFIX + ') — foreign QR traffic refuses typed, the lane never guesses.');
        }
        return stone.decode(hit.data);
    }
};

// ==================== THE POINTER QR — the extended vant frame ====================
// The scanned mark `VANT:1:<64-hex content address>` is the LATTICE-scale
// identity the 12-digit NSC-9 doorway cannot carry (the nsc9 spec's own
// correction: the barcode is the doorway, the lattice is the space). The
// pointer path resolves THROUGH the traveler lib's own persistence: the
// body for an id lives at state/travelers/<id>.json (written by persist(),
// append-only), and a resolved packet re-enters the FULL address law
// (verify) before it is ever handed back. A legal frame whose body is not
// on this node is NOT an error — it is an honest UNRESOLVED pointer: the
// record says the packet exists (somewhere) and is not here yet.

const POINTER_FRAME_PREFIX = 'VANT:1:';
const POINTER_FRAME_RE = /^VANT:1:([0-9a-f]{64})$/;

function _qPointerFrame(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id)) {
        throw coded(CODES.SHAPE, 'a pointer frame needs the 64-hex content address (the packet\'s own id) — refuse, never abbreviate.');
    }
    return POINTER_FRAME_PREFIX + id.toLowerCase();
}

function _qPointerDecode(mark, o) {
    const m = POINTER_FRAME_RE.exec(mark.trim());
    if (!m) {
        _emit('carrier:refused', { carrier: 'qr', why: 'pointer-shape' });
        throw coded(CODES.SHAPE, 'not an extended vant pointer frame (' + POINTER_FRAME_PREFIX + '<64-hex address>) — refuse, never repair.');
    }
    const id = m[1];
    // Pure-pointer option (the owner's scan ruling): `pointerOnly` skips
    // the resolve read entirely — the mark alone rides home.
    if (o && o.pointerOnly === true) {
        return { carrier: 'qr', v: CARRIER_VERSION, kind: 'pointer', frame: mark.trim(), id, resolved: false };
    }
    // THE RESOLVE: a read through the traveler's own body store. Fail-closed
    // on unreadable store, honest-unresolved on a legal-but-absent packet.
    const fsMod = require('fs');
    const pathMod = require('path');
    let bodyFile;
    try {
        bodyFile = pathMod.join(pathMod.dirname(traveler._ledgerPath()), 'travelers', id + '.json');
    } catch (e) {
        return _pointerMiss(mark, id, 'no-store');
    }
    let body;
    try { body = JSON.parse(fsMod.readFileSync(bodyFile, 'utf8')); } catch (e) {
        return _pointerMiss(mark, id, 'no-body');
    }
    // THE PACKET WALL on resolve: the body must BE the address (not merely
    // sit beside it). A forged/swapped body refuses typed.
    if (!body || body.id !== id) {
        _emit('carrier:refused', { carrier: 'qr', why: 'pointer-body-mismatch', id: id.slice(0, 12) });
        throw coded(CODES.TAMPER, 'the pointer\'s body does not answer to its address (' + id.slice(0, 12) + ') — refuse, never repair.');
    }
    _packetOrThrow(body, 'qr');
    _auditLine('[Carrier qr] pointer resolved ' + id.slice(0, 12) + ' seq ' + body.seq);
    return { carrier: 'qr', v: CARRIER_VERSION, kind: 'pointer', frame: mark.trim(), id, resolved: true, traveler: body };
}

// (pass 267) THE WIRE HOOK — the cross-node pointer fetch seam (pass 265's
// pointer marks named a packet existing SOMEWHERE; the hook is how a
// resolving node whose LOCAL store misses reaches it). Sync seam BY
// CONTRACT: lib/carriers is a pure sync lib and never touches the network —
// the node's own fetch layer (e.g. the traveler_fetch door verb) decides
// the wire; the wall belongs to carriers wherever the body came from.
let _pointerFetch = null;   // (id) => { found: true, traveler } | { found: false } | null

/** Wire the cross-node pointer fetch hook (or null to clear it). The hook
 *  answers in the traveler_fetch door's own JSON shape; a hook that is not
 *  a function refuses typed — the seam never fakes. */
function setPointerFetch(fn) {
    if (fn === null) { _pointerFetch = null; return; }
    if (typeof fn !== 'function') {
        throw coded(CODES.SHAPE, 'setPointerFetch takes a hook function or null — the seam never fakes.');
    }
    _pointerFetch = fn;
}

/** The LOCAL MISS lane: no body on this node. With a hook wired, the wire
 *  gets ONE chance; without it, the classic honest record. Fail-closed on
 *  BOTH lanes: unreachable stays an honest unresolved record ('unreachable'),
 *  a wire body that does not answer to the mark's address refuses typed
 *  E_CARRIER_TAMPER, and a fetched body re-enters the FULL packet wall
 *  (shape + verify) before it is ever handed back. The local record reasons
 *  ('no-store'/'no-body') are preserved word-for-word when no hook is set. */
function _pointerMiss(mark, id, localReason) {
    if (typeof _pointerFetch !== 'function') {
        return { carrier: 'qr', v: CARRIER_VERSION, kind: 'pointer', frame: mark.trim(), id, resolved: false, reason: localReason };
    }
    let wire = null;
    try { wire = _pointerFetch(id); } catch (e) { wire = null; /* a hook that throws is an unreachable wire */ }
    if (!wire || typeof wire !== 'object' || wire.found !== true) {
        // found:false (or a dead hook) = fail-closed honest record — the
        // packet is not on the wire either; never a fabricated resolve.
        return { carrier: 'qr', v: CARRIER_VERSION, kind: 'pointer', frame: mark.trim(), id, resolved: false, reason: 'unreachable' };
    }
    const wbody = wire.traveler;
    if (!wbody || typeof wbody !== 'object' || wbody.id === undefined) {
        _emit('carrier:refused', { carrier: 'qr', why: 'pointer-wire-shape' });
        return { carrier: 'qr', v: CARRIER_VERSION, kind: 'pointer', frame: mark.trim(), id, resolved: false, reason: 'wire-shape' };
    }
    // THE ADDRESS LAW RIDES THE WIRE: the delivered body must answer to the
    // mark (a swapped body refuses, exactly as a local one would).
    if (wbody.id !== id) {
        _emit('carrier:refused', { carrier: 'qr', why: 'pointer-wire-mismatch', id: id.slice(0, 12) });
        throw coded(CODES.TAMPER, 'the fetched body does not answer to its address (' + id.slice(0, 12) + ') — the wall rides the wire; refuse, never repair.');
    }
    _packetOrThrow(wbody, 'qr');
    _auditLine('[Carrier qr] pointer resolved via fetch ' + id.slice(0, 12) + ' seq ' + wbody.seq);
    return { carrier: 'qr', v: CARRIER_VERSION, kind: 'pointer', frame: mark.trim(), id, resolved: true, fetched: true, traveler: wbody };
}

// ==================== DECLARED-ABSENT CARRIERS (the honesty roster) ====================

function _absent(id, hint, blocker) {
    const refusal = () => {
        _emit('carrier:refused', { carrier: id, why: 'absent' });
        throw coded(CODES.CARRIER,
            'the `' + id + '` carrier is declared but not implemented yet: ' + blocker +
            ' (' + hint + '). It refuses typed instead of pretending.');
    };
    return {
        id,
        generation: CARRIER_VERSION,
        family: 'declared-absent',
        carries: null,
        available: false,
        note: hint,
        hint,
        blocker,
        encode: refusal,
        decode: refusal,
        matches: refusal
    };
}

_register(_absent('png',
    'the raster/airgap lane over real image files (deeper than the svg stone)',
    'the lib/stego raster lane is a file/async interface with a carrier contract to settle'));

// ==================== THE ROSTER ====================

_register(nsc9);
_register(stone);
_register(svgCarrier);
_register(jsonCarrier);
_register(qrCarrier);   // pass 264: the symbology lane is real

/**
 * The public roster: every carrier (available or honestly absent). The
 * door/marketing surfaces read THIS — it never overstates.
 */
function list() {
    const out = [];
    for (const id of Object.keys(_registry).sort()) {
        const c = _registry[id];
        out.push({
            id: c.id,
            generation: c.generation,
            family: c.family,
            carries: c.carries,
            available: c.available !== false,
            note: c.note,
            hint: c.hint || undefined,
            blocker: c.blocker || undefined
        });
    }
    return out;
}

function get(id) {
    const key = _vafStr(id, 'carrier-id', 40);
    if (!key || !_registry[key]) {
        throw coded(CODES.CARRIER, 'unknown carrier `' + (key || '(none)') + '` (known: ' + Object.keys(_registry).sort().join(', ') + ') — the pack never pretends to speak a lane it does not have.');
    }
    return _registry[key];
}

/** encode(t, carrierName, opts) — the packet through one named lane. */
function encode(t, carrierName, opts) {
    return get(carrierName).encode(t, opts);
}

/** decode(carrierName, artifact, ...extra) — the artifact back into a
 *  packet/pointer. Extra args (e.g. the svg pair password) pass straight
 *  through to the named carrier's decode. */
function decode(carrierName, artifact, ...extra) {
    return get(carrierName).decode(artifact, ...extra);
}

// ==================== THE ROUTED LETTER (carry) ====================

/**
 * Route the packet through stations — the certified letter, one call.
 *
 * @param {object} t          the packet (minted/mintScoped by the caller)
 * @param {object} opts
 *   stations: ordered route stages, each { by, op?, team?, carrier?,
 *             carrierOpts?, privileged?, approvalId? }
 *             - by (required)      the acting station identity (vaf-kept)
 *             - op                 the station verb (default 'carry')
 *             - carrier            OPTIONAL per-stage assimilation lane id
 *             - privileged + approvalId  the escrow risk lane (single-use)
 * Every stage CHECKS (scope lineage), RISKS (escrow for privileged hops),
 * and AUDITS (bus + trail) — the traveler's own advance() runs the gates —
 * then advances the ledger. The first refusal DROPS the packet: the report
 * carries the typed code and the walk certifies where continuity stopped.
 *
 * @returns {object} the route report (the auditor's copy):
 *   { ok, stations, landed, route: [{ stage, by, op?, seq?, carrier?,
 *      verdict: 'landed'|'refused', code? }], refused?: { stage, by, code,
 *      error }, letter: the final packet, walk: replay(station landings) }
 */
function carry(t, opts) {
    const o = opts || {};
    const stations = Array.isArray(o.stations) ? o.stations : [];
    if (!stations.length) {
        throw coded(CODES.SHAPE, 'carry needs a route: stations: [{ by, op?, part?, carrier?, privileged?, approvalId? }] — routing without stages is not a certified letter.');
    }
    // (pass 260) THE TEMPLATE LAW: a declared bill of stations is matched
    // row-for-row against the caller's stations BEFORE anything moves — a
    // reordered stage (op at the wrong position), a skipped row, or an
    // unplanned extra station refuses typed E_CARRIER_TEMPLATE. The
    // wildcard row (by:'*', op:'*') admits whatever the caller chose for
    // that stage: compliance defines the SHAPE of the chain, flexibility
    // fills it. Matching is on the DECLARED fields only (by when the row
    // names one, op when the row names one); undeclared row fields match
    // anything.
    const template = Array.isArray(o.template) ? o.template : null;
    if (template) {
        if (template.length !== stations.length) {
            _emit('carrier:refused', { carrier: 'template', why: 'length' });
            throw coded(CODES.TEMPLATE, 'the route stations (' + stations.length + ') do not match the bill of stations (' + template.length + ') — a template is followed whole, never truncated or padded.');
        }
        for (let i = 0; i < template.length; i++) {
            const row = template[i] || {};
            const st = stations[i] || {};
            if (row.by && row.by !== '*' && row.by !== st.by) {
                _emit('carrier:refused', { carrier: 'template', why: 'by', stage: i + 1 });
                throw coded(CODES.TEMPLATE, 'stage ' + (i + 1) + ' runs at `' + (st.by || '(none)') + '`, but the bill of stations names `' + row.by + '` — the chain is followed in order, never reordered.');
            }
            if (row.op && row.op !== '*' && row.op !== (st.op || 'carry')) {
                _emit('carrier:refused', { carrier: 'template', why: 'op', stage: i + 1 });
                throw coded(CODES.TEMPLATE, 'stage ' + (i + 1) + ' performs `' + (st.op || 'carry') + '`, but the bill of stations declares `' + row.op + '` — the chain is followed in order, never reordered.');
            }
        }
    }
    _packetOrThrow(t, 'carry');   // a route never STARTS from a tampered packet
    const report = { ver: CARRIER_VERSION, ok: true, stations: stations.length, landed: 0, route: [], refused: null, letter: null };
    let packet = t;
    const landings = [];

    for (let i = 0; i < stations.length; i++) {
        const st = stations[i] || {};
        const stage = i + 1;
        try {
            const by = _vafStr(st.by, 'route-by', 120);
            if (!by) throw coded(CODES.SHAPE, 'stage ' + stage + ' needs `by` — a letter without a station of record is not a letter.');
            // CHECK + RISK lanes run INSIDE advance(): scopeCheck on the
            // lineage; approvalFor burns a single-use escrow approval when
            // the hop is privileged. AUDIT rides the shared bus + trail.
            // ASSIMILATION (the manufacturing hand): the station may ATTACH
            // its part (the assembly slot it owns) AND sign off in one
            // landing — advance() writes the part into slots.assembly inside
            // the content address, so it cannot be edited by a later hop.
            packet = traveler.advance(packet, {
                op: st.op || 'carry',
                by,
                team: st.team,
                part: st.part !== undefined
                    ? (typeof st.part === 'string'
                        ? { name: st.part, attachedBy: by, ts: Date.now() }   // a bare string names the slot; a minimal honest body is minted
                        : st.part)
                    : undefined,
                privileged: st.privileged === true ? true : undefined,
                approvalId: st.approvalId
            });
            // ASSIMILATION lane (optional): the packet rides a named carrier
            // at this stage on its way out.
            let carrierId = null;
            if (st.carrier) {
                const art = encode(packet, _vafStr(st.carrier, 'route-carrier', 40), st.carrierOpts);
                carrierId = art.carrier;
            }
            const row = {
                stage,
                seq: packet.seq,
                by,
                op: packet.steps[packet.steps.length - 1].op,
                part: packet.steps[packet.steps.length - 1].part,
                carrier: carrierId || undefined,
                verdict: 'landed'
            };
            landings.push({ seq: row.seq, from: row.by });
            report.route.push(row);
            report.landed++;
            report.parts = packet.slots.assembly ? Object.keys(packet.slots.assembly) : (report.parts || []);
            _emit('carrier:route_stage', { id: packet.id, stage: stage, seq: packet.seq, by: by, part: row.part, carrier: carrierId, ok: true });
        } catch (e) {
            // FAIL-CLOSED: the packet does not ride past a refused stage.
            const code = (e && e.code) || 'E_CARRIER_ROUTE';
            report.ok = false;
            report.refused = { stage, by: st.by || null, code, error: (e && e.message) || String(e) };
            report.route.push({ stage, by: st.by || null, verdict: 'refused', code });
            _emit('carrier:route_refused', { id: packet.id, stage, by: st.by || null, code });
            _auditLine('[Carrier route] stage ' + stage + ' refused (' + code + ') — packet drops at ' + packet.seq);
            break;
        }
    }

    // THE AUDIT WALK: certify the route's own continuity over its landings.
    // The walk is seeded with the LETTER'S OWN LEDGER (the birth step per
    // law 2 — the packet's shape law already demands exact internal contiguity,
    // so the letter itself is the canon), then each stage landing is checked
    // against it. A letter refused at its FIRST stage walks just its birth.
    const walkedLandings = landings.length ? landings : [{ seq: packet.seq, from: packet.from }];
    report.walk = replay([packet].concat(walkedLandings));   // the packet supplies the canon; the stage rows prove the ride
    if (!report.walk.ok) report.ok = false;
    report.letter = packet;
    // (pass 260) THE BUILD VERDICT: a letter that followed its template
    // whole and filled every declared part-slot is BUILT — the certified
    // manufacture complete, one call said so.
    if (template) {
        // every TEMPLATE row that DECLARES a part (a name-string or an object
        // with .name) must be FILLED in slots.assembly for the letter to be
        // BUILT. Wildcards without parts impose no assembly duty.
        const declaredSlots = template
            .map((row) => (row && typeof row.part === 'string') ? row.part : (row && row.part && typeof row.part === 'object' && row.part.name) || null)
            .filter((n) => typeof n === 'string' && n);
        const unfilled = declaredSlots.filter((slotName) => !(packet.slots.assembly && packet.slots.assembly[slotName]));
        report.built = report.ok && unfilled.length === 0;
        if (report.built) {
            report.assembly = { ...packet.slots.assembly };
        } else if (unfilled.length) {
            report.unfilled = unfilled;
        }
    } else {
        report.built = report.ok;   // no template: built == the route rode clean
    }
    _auditLine('[Carrier route] ' + packet.id.slice(0, 12) + ': ' + report.landed + '/' + stations.length + ' stages landed, ok=' + report.ok + (template ? ', built=' + report.built : ''));
    _emit('carrier:routed', { id: packet.id, ok: report.ok, landed: report.landed, stages: stations.length });
    return report;
}

// ==================== CONTINUITY + BACKTRACKING (the 8.5.2 walk) ====================

/**
 * The continuity walk across carried landings of ONE traveler lineage.
 * Inputs, mixed freely (the walk accepts both shapes):
 *   - PACKETS: travelers (or decode()'s `.traveler` results) — the packet's
 *     full ledger 1..N is absorbed into the walk canon.
 *   - ROWS: thin ledger landing rows ({ seq, ts?, from?, ... } — the pin
 *     ledger's per-id rows or any landing receipt with a seq).
 *
 * Walk laws:
 *   - Arrivals must verify/shape-check (packets) or name a seq (rows);
 *     malformed inputs refuse typed.
 *   - The walk position (walkedTo) only moves FORWARD. A row/seq landing at
 *     walkedTo+1 advances it. A landing ABOVE it names a GAP
 *     (walkedTo+1 .. landing-1 are missing from the record).
 *   - A packet arrival re-carrying already-walked seqs must agree with the
 *     canon on (seq,op,by,ts) — anything else is a REWRITE finding with
 *     BOTH versions on the record (the backtrack evidence). A packet whose
 *     re-carried prefix AGREES is a re-delivery — airgap lanes re-read
 *     marks repeatedly; matching history is continuity, never an event.
 *   - A row re-landing at an already-walked seq is likewise a re-delivery.
 *
 * Legal inputs with continuity breaches RETURN the report (the auditor's
 * copy of the backtrack map); only ILLEGAL inputs throw.
 *
 * @param {Array} arrivals arrival-ordered packets and/or landing rows
 * @returns {object} { ok, arrivals, stations, walkedTo, gaps, rewrites,
 *                     firstSeq, lastSeq }
 */
function replay(arrivals) {
    if (!Array.isArray(arrivals) || arrivals.length === 0) {
        throw coded(CODES.SHAPE, 'replay needs an arrival-ordered array of packets and/or landing rows.');
    }

    const packets = [];
    const rows = [];
    for (const entry of arrivals) {
        const inner = entry && entry.traveler ? entry.traveler : entry;
        if (inner && Array.isArray(inner.steps) && inner.id) {
            _packetOrThrow(inner, 'replay');
            packets.push(inner);
        } else if (inner && Number.isFinite(inner.seq)) {
            rows.push(inner);
        } else {
            throw coded(CODES.SHAPE, 'replay arrival is neither a packet nor a landing row (need id+steps or seq): ' + JSON.stringify(entry).slice(0, 60));
        }
    }
    // The walk merges both lanes into one arrival stream by recorded order:
    // for a packet the arrival seq is its own; rows arrive where they sit.
    // Simplest honest order: rows are appended AFTER packets of the same
    // pass-through, since callers that have packets hand them in order.
    const stream = [];
    let pi = 0;
    for (let i = 0; i < arrivals.length; i++) {
        const entry = arrivals[i];
        const inner = entry && entry.traveler ? entry.traveler : entry;
        const meta = entry && entry.traveler ? entry : null;
        if (inner && Array.isArray(inner.steps) && inner.id) {
            stream.push({ kind: 'packet', at: pi, packet: inner, carrier: meta && meta.carrier });
            pi++;
        } else {
            stream.push({ kind: 'row', row: inner });
        }
    }

    const report = {
        ver: CARRIER_VERSION,
        ok: true,
        arrivals: stream.length,
        stations: 0,
        walkedTo: 0,
        gaps: [],
        rewrites: [],
        firstSeq: null,
        lastSeq: null
    };

    const canon = new Map();   // seq -> { seq, op, by, ts } (the ledger canon)
    const rowSeqs = new Set(); // distinct ROW landings (rows lack step content)

    const absorbPacket = (p) => {
        if (report.firstSeq === null) {
            report.firstSeq = p.steps[0].seq;
        }
        for (const s of p.steps) {
            const known = canon.get(s.seq);
            if (known && (known.op !== s.op || known.by !== s.by || known.ts !== s.ts)) {
                report.rewrites.push({ seq: s.seq, canon: known, arrived: { seq: s.seq, op: s.op, by: s.by, ts: s.ts }, id: p.id, at: report.arrivals });
            }
            if (!known) canon.set(s.seq, { seq: s.seq, op: s.op, by: s.by, ts: s.ts });
        }
        if (p.seq > report.walkedTo) {
            // Internal contiguity is the packet's own shape law, so a forward
            // jump here means the record between walkedTo and this arrival
            // was SPLIT across carriers (some station carried the packet
            // forward without the intermediate landings). Boundary gap:
            if (p.steps[0].seq > report.walkedTo + 1) {
                const missing = [];
                for (let q = report.walkedTo + 1; q < p.steps[0].seq; q++) missing.push(q);
                if (missing.length) {
                    report.gaps.push({ missing, afterSeq: report.walkedTo, arrivedAt: p.steps[0].seq, id: p.id });
                }
            }
            report.walkedTo = p.seq;
            report.lastSeq = p.steps[p.steps.length - 1].seq;
        }
    };

    const absorbRow = (row) => {
        const seq = row.seq;
        if (report.firstSeq === null) report.firstSeq = seq;
        // A row re-landing at an already-seen seq (from a packet canon OR a
        // previous row) is a re-delivery — continuity, never an event.
        if (seq <= report.walkedTo) return;
        if (!canon.has(seq)) rowSeqs.add(seq);
        if (seq > report.walkedTo + 1) {
            const missing = [];
            for (let q = report.walkedTo + 1; q < seq; q++) missing.push(q);
            report.gaps.push({ missing, afterSeq: report.walkedTo, arrivedAt: seq, from: row.from !== undefined ? row.from : undefined });
            // The gap does NOT stop the walk: walkedTo jumps only when the
            // concrete landing EXISTS. A gap stays a name on the record.
            report.walkedTo = seq;   // (the record continues from the landing seen)
        } else {
            report.walkedTo = seq;
            report.lastSeq = seq;
        }
    };

    for (const step of stream) {
        if (step.kind === 'packet') absorbPacket(step.packet);
        else absorbRow(step.row);
    }

    report.stations = canon.size + rowSeqs.size;
    if (report.gaps.length || report.rewrites.length) report.ok = false;
    _emit('carrier:replayed', { ok: report.ok, gaps: report.gaps.length, rewrites: report.rewrites.length, stations: report.stations });
    if (report.ok) {
        _auditLine('[Carrier replay] clean walk: ' + report.stations + ' stations across ' + report.arrivals + ' arrivals');
    } else {
        _auditLine('[Carrier replay] BACKTRACK report: ' + report.gaps.length + ' gap(s), ' + report.rewrites.length + ' rewrite(s) — the record refuses to pretend continuity.');
    }
    return report;
}

// ==================== THE CARRIER PLATE (pass 262, the mycelium touch) ====================

// RESERVED ids: the built-in roster and the roster's operational names can
// never be shadowed by a plate (a plate named 'stone' would forge the
// built-in lane's artifacts).
const RESERVED_IDS = new Set(['nsc9', 'stone', 'svg', 'json', 'qr', 'png', 'carrier-x', 'template']);
const PLATE_ID_RE = /^[a-z][a-z0-9-]{1,31}$/;

// ==================== DECLARATIVE PLATES (data, not code) ====================

/**
 * (pass 262) THE DECLARATIVE CARRIER PLATE: a carrier ANYONE can define —
 * enterprise or hobbyist — as DATA (frames + caps, no code), persisted in
 * the brain so it spreads the way the mycelium spreads: define once,
 * hydrate in every process from now on.
 *
 * A plate is a frame law over the STONE socket (the only piece a definer
 * can safely change is WHERE the packet sits inside their frame):
 *
 *   { id: 'mfg-tag',                      // PLATE_ID_RE, not RESERVED
 *     family: 'tag',                      // free label (informational)
 *     carries: 'full-object'|'id-pointer',// what it holds
 *     frame: { prefix: 'MTG/', suffix: '' },   // literal frame strings
 *     note: '...' }                       // shown in the roster
 *
 * The PLATE'S ARTIFACT is its stone envelope framed IN and OUT:
 *   artifact = frame.prefix + stoneEnvelope + frame.suffix
 * so the plate rides BOTH walls by construction: the stone seal catches
 * carrier damage, the packet address law catches content tamper, and the
 * definer never writes a line of crypto. Pointer plates ('id-pointer')
 * ride NSC-9's frame in the same way.
 *
 * Persistence: models/private/<brain>/state/carrier-plates.json (append-
 * per-id upsert, atomic write, .sha256 pin like every brain file) —
 * hydrated into the registry at module load and on every plateDefine(),
 * so the mycelium spreads across restarts without a signup.
 */

let _fsMod = null;
function _fs() {
    if (!_fsMod) _fsMod = require('fs');
    return _fsMod;
}

function _plateStorePath() {
    try {
        const brainMod = require('./brain');
        const root = typeof brainMod.getBrainPath === 'function' ? brainMod.getBrainPath() : 'models/private';
        return require('path').join(root, 'state', 'carrier-plates.json');
    } catch (e) {
        return 'models/private/vant/state/carrier-plates.json';
    }
}

function plateList() {
    try { return JSON.parse(_fs().readFileSync(_plateStorePath(), 'utf8')).plates || []; }
    catch (e) { return []; }
}

function _plateStoreSave(plates) {
    const p = _plateStorePath();
    const { atomicWriteFile } = require('./primitives');
    const dir = require('path').dirname(p);
    _fs().mkdirSync(dir, { recursive: true });
    atomicWriteFile(p, JSON.stringify({ v: CARRIER_VERSION, plates }, null, 2));
    atomicWriteFile(p + '.sha256', hashLib.sha256(_fs().readFileSync(p)) + '  ' + p + '\n');
}

/**
 * Build the carrier object a plate DEFINES (the wall wrappers are the
 * lib's, never the definer's).
 */
function _plateCarrier(def) {
    const prefix = typeof def.frame.prefix === 'string' ? def.frame.prefix : '';
    const suffix = typeof def.frame.suffix === 'string' ? def.frame.suffix : '';
    const pointer = def.carries === 'id-pointer';
    const carrier = {
        id: def.id,
        generation: 'plate/' + (def.v || 1),
        family: def.family || 'plate',
        carries: def.carries,
        plate: true,
        note: def.note || ('plate carrier (defined ' + (def.definedAt ? new Date(def.definedAt).toISOString().slice(0, 10) : '') + ')'),
        available: true
    };
    carrier.encode = function (t) {
        if (pointer) {
            _packetOrThrow(t, def.id);
            const framed = prefix + _nsc9FrameFromId(t.id) + suffix;
            _auditLine('[Carrier ' + def.id + '] framed ' + t.id.slice(0, 12) + ' (plate, pointer)');
            _emit('carrier:encoded', { carrier: def.id, kind: 'address', plate: true, id: t.id });
            return { carrier: def.id, v: carrier.generation, kind: 'address', frame: framed, id: t.id };
        }
        const inner = stone.encode(t);
        const framed = prefix + inner.envelope + suffix;
        _auditLine('[Carrier ' + def.id + '] sealed ' + t.id.slice(0, 12) + ' seq ' + t.seq + ' (plate)');
        _emit('carrier:encoded', { carrier: def.id, kind: 'packet', plate: true, id: t.id, seq: t.seq });
        return { carrier: def.id, v: carrier.generation, kind: 'packet', frame: framed, envelope: inner.envelope, id: t.id, seq: t.seq };
    };
    carrier.decode = function (artifact) {
        // framed-ARTIFACT law (pass 262): the plate's body is content (see
        // _carrierStr); full vaf.check collides with framed bodies.
        const s = _carrierStr(artifact, def.id + ' frame', STONE_MAX_CTEXT + 512, def.id);
        if (typeof s !== 'string' || !s.startsWith(prefix) || !s.endsWith(suffix)) {
            _emit('carrier:refused', { carrier: def.id, why: 'shape' });
            throw coded(CODES.SHAPE, 'the `' + def.id + '` frame does not match its plate law (expected ' + JSON.stringify(prefix) + '…' + JSON.stringify(suffix) + ') — refuse, never repair.');
        }
        const inner = s.slice(prefix.length, s.length - suffix.length);
        if (pointer) {
            const parsed = nsc9.decode(inner);
            _auditLine('[Carrier ' + def.id + '] read ' + (parsed.frame || inner) + ' (plate, pointer)');
            return { carrier: def.id, v: carrier.generation, kind: 'address', pointer: parsed };
        }
        const out = stone.decode(inner);   // BOTH walls re-apply by construction
        _auditLine('[Carrier ' + def.id + '] landed ' + out.traveler.id.slice(0, 12) + ' seq ' + out.traveler.seq + ' (plate)');
        out.carrier = def.id;
        return out;
    };
    return carrier;
}

/**
 * The plate definition gates: id law, reserved names, frame law, carried
 * law. Malformed definitions refuse typed — the plate never half-exists.
 * @param {object} def { id, carries, frame: { prefix?, suffix? }, family?, note? }
 */
function plateDefine(def) {
    const d = def || {};
    if (typeof d.id !== 'string' || !PLATE_ID_RE.test(d.id)) {
        throw coded(CODES.SHAPE, 'a carrier plate needs an id matching ' + PLATE_ID_RE.source + ' (lowercase kebab, 2-32 chars).');
    }
    if (RESERVED_IDS.has(d.id)) {
        throw coded(CODES.CARRIER, 'the id `' + d.id + '` is reserved (the built-in roster and operational names can never be shadowed by a plate).');
    }
    if (d.carries !== 'full-object' && d.carries !== 'id-pointer') {
        throw coded(CODES.SHAPE, 'a plate must declare carries: full-object | id-pointer (what the lane holds is the first law).');
    }
    if (!d.frame || typeof d.frame !== 'object' || (typeof d.frame.prefix !== 'string' && typeof d.frame.suffix !== 'string')) {
        throw coded(CODES.SHAPE, 'a plate needs frame: { prefix?, suffix? } — at least one literal frame string separates your lane from every other lane.');
    }
    // Frame sanity: a prefix/suffix may not CONTAIN the stone/NSC grammar's
    // own punctuation in a way that could forge another lane's artifact.
    const frameText = (d.frame.prefix || '') + (d.frame.suffix || '');
    if (frameText.includes('VSTN:')) {
        throw coded(CODES.SHAPE, 'a plate frame may not embed the built-in stone grammar (VSTN:) — define your own marker.');
    }
    const persist = { id: d.id, carries: d.carries, frame: { prefix: d.frame.prefix || '', suffix: d.frame.suffix || '' }, family: d.family || 'plate', note: _vafStr(d.note, 'plate-note', 200), v: CARRIER_VERSION, definedAt: Date.now(), definedBy: (function () { try { const b = require('./brain'); return (b.getCurrentBrain && b.getCurrentBrain()) || 'vant'; } catch (e) { return 'vant'; } })() };
    const plates = plateList().filter((b) => b.id !== persist.id);
    plates.push(persist);
    _plateStoreSave(plates);
    _register(_plateCarrier(persist));
    _auditLine('[Carrier plate] defined `' + persist.id + '` (' + persist.carries + ', brain ' + persist.definedBy + ') — the mycelium spreads.');
    _emit('carrier:plate_defined', { id: persist.id, carries: persist.carries });
    return persist;
}

/** Hydrate persisted plates into the registry (module load + after define). */
function _hydratePlates() {
    let count = 0;
    for (const def of plateList()) {
        try {
            if (!_registry[def.id]) {
                _register(_plateCarrier(def));
                count++;
            }
        } catch (e) { /* a corrupt plate hydrates skipped, never blocks the roster */ }
    }
    if (count) _auditLine('[Carrier plate] hydrated ' + count + ' persisted plate(s) from the brain store.');
}

// ==================== PROCESS-LIFETIME CODE CARRIERS (define) ====================

/**
 * (pass 262) THE CODE CARRIER: a PROCESS-LIFETIME custom carrier wrapping a
 * definer's encode/decode pair — for integrations whose lane has real logic
 * (a printer driver, an EDI lane, a BLE beacon) that cannot live as frame
 * data. Same law everywhere: the wrapper runs the packet gate on the way IN
 * (shape + verify) so a tampered packet can never ride ANY lane, and the
 * definer owns only their body bytes. NEVER persisted (code is not data):
 * a plate that must survive restarts is a declarative plateDefine().
 *
 * @param {object} def { id, family?, note?, encode(t), decode(artifact) }
 */
function define(def) {
    const d = def || {};
    if (typeof d.id !== 'string' || !PLATE_ID_RE.test(d.id)) {
        throw coded(CODES.SHAPE, 'a code carrier needs an id matching ' + PLATE_ID_RE.source + '.');
    }
    if (RESERVED_IDS.has(d.id)) {
        throw coded(CODES.CARRIER, 'the id `' + d.id + '` is reserved.');
    }
    if (typeof d.encode !== 'function' || typeof d.decode !== 'function') {
        throw coded(CODES.SHAPE, 'a code carrier needs encode(t) and decode(artifact) functions.');
    }
    const wrapped = {
        id: d.id,
        generation: 'custom/1',
        family: d.family || 'custom',
        carries: d.carries || 'full-object',
        custom: true,
        note: d.note || 'process-lifetime code carrier',
        available: true,
        encode(t, opts) {
            _packetOrThrow(t, d.id);   // THE LAW: no lane assimilates a tampered packet
            const art = d.encode(t, opts);
            _emit('carrier:encoded', { carrier: d.id, kind: 'packet', custom: true, id: t.id });
            return art;
        },
        decode(...args) {
            const out = d.decode(...args);
            // If the definer returns a PACKET, it re-enters the law (verify).
            // Pointer lanes return their own shape — untouched.
            if (out && out.traveler) _packetOrThrow(out.traveler, d.id);
            else if (out && out.id && out.steps) _packetOrThrow(out, d.id);
            _emit('carrier:decoded', { carrier: d.id, custom: true });
            return out;
        }
    };
    _register(wrapped);
    _auditLine('[Carrier plate] code carrier `' + d.id + '` registered (process-lifetime, never persisted).');
    return wrapped;
}

// hydrate at load (the mycelium is already everywhere it was defined)
_hydratePlates();

module.exports = {
    CARRIER_VERSION,
    STONE_FRAME_FORMAT,
    STONE_MAX_CTEXT,
    QR_MAX_CTEXT,
    // (pass 267) the cross-node pointer fetch seam (the wire hook; null
    // clears — see _pointerMiss law above)
    setPointerFetch,
    CODES,
    NSC9_FRAME_RE,
    list,
    get,
    encode,
    decode,
    carry,
    replay,
    plateDefine,
    plateList,
    // (pass 262, test/interop seam) the hydration step exposed so tests can
    // simulate a fresh process (and hosts can force a re-hydrate after an
    // out-of-band plate edit). Production load path already calls it.
    _hydratePlates,
    define,
    nsc9,
    stone,
    svg: svgCarrier,
    json: jsonCarrier,
    qr: qrCarrier,
    _registry
};

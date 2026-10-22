/**
 * src/pages/Changelog.jsx (vant-home)
 * ===================================
 * Renders the parsed changelog data (src/generated/changelog.json) — no
 * hand-written content ships here. The data is a build-time artifact of
 * web/home/scripts/parse-changelog.mjs reading the repo's canonical
 * CHANGELOG.md, and scripts/check-changelog-parity.js (repo root) byte-gates
 * the committed JSON against a fresh parse, so the page CANNOT drift from
 * the real changelog.
 *
 * The GitHub CHANGELOG.md stays canonical: releases link there.
 */

import React from 'react'
import data from '../generated/changelog.json'

export default function Changelog() {
    return (
        <section className="legal">
            <div className="container">
                <div className="sec-head"><span className="sec-idx">01</span><h2>Changelog</h2></div>
                <p className="sub">
                    Rendered at build time from the repository's canonical{' '}
                    <a href="https://github.com/dhaupin/vant/blob/main/CHANGELOG.md">CHANGELOG.md</a> — the parser copies it
                    {' '}out and a parity gate byte-compares the result on every CI run, so what you read here is exactly
                    {' '}what is committed there (version truth pinned against package.json). For tagged releases with
                    {' '}patch notes, the <a href="https://github.com/dhaupin/vant/releases">GitHub releases</a> page is one click away.
                </p>

                {data.entries.map((e, i) => (
                    <div className="cl-entry" key={i}>
                        <h3 className="cl-ver">
                            <span className={'cl-badge' + (e.kind === 'release' ? ' cl-badge-rel' : '')}>
                                {e.kind === 'release' ? e.version : 'Unreleased'}
                            </span>
                            {e.date ? <span className="cl-date">{e.date}</span> : null}
                            {e.title ? <span className="cl-title">{e.title}</span> : null}
                        </h3>
                        {e.sections.map((s, j) => (
                            <div className="cl-sec" key={j}>
                                <div className="cl-sec-name">{s.name}</div>
                                <ul>
                                    {s.items.map((item, k) => (
                                        <li key={k} dangerouslySetInnerHTML={{ __html: inlineMd(item) }} />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                ))}

                <a className="backtop" href="https://github.com/dhaupin/vant/blob/main/CHANGELOG.md">The real CHANGELOG.md →</a>
            </div>
        </section>
    )
}

// The changelog carries inline markdown that reads well raw (`code`, **bold**,
// plain links). Render exactly those three shapes; nothing else gets
// interpreted. Escape everything first, then re-apply the safe spans.
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inlineMd(s) {
    return esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
}

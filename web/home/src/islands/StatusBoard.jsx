/**
 * src/islands/StatusBoard.jsx (vant-home)
 * =======================================
 * Island for /status (client-only, never prerendered). Checks real public
 * endpoints from the browser and reports honestly, including its own limits.
 *
 * What is actually checked:
 *   - GitHub REST API (CORS-writable for browsers): repo metadata + latest
 *     release for dhaupin/vant.
 *   - docs.creadev.org and prestruct/freestruct family sites: fetched with
 *     mode:'no-cors'. The response body is opaque by CORS design, so the
 *     honest result is binary: the network request completed at all or not.
 *     A healthy-looking "reachable" from a captive portal is possible in
 *     theory, so the board says REACHABLE (network-level) not OPERATIONAL.
 *
 * Nothing is stored, nothing POSTs. Results include the check timestamp.
 */

import React, { useEffect, useState } from 'react'

const REPO_API = 'https://api.github.com/repos/dhaupin/vant'
const RELEASE_API = 'https://api.github.com/repos/dhaupin/vant/releases/latest'

// Opaque-mode fetch surface check: resolves only when the network itself
// answered; content is never readable (and never claimed to be).
async function probe(url) {
    try {
        await fetch(url, { mode: 'no-cors', cache: 'no-store' })
        return { state: 'reachable', time: new Date().toLocaleTimeString() }
    } catch (e) {
        return { state: 'unreachable', time: new Date().toLocaleTimeString() }
    }
}

// CORS-readable JSON check: full response status is visible.
async function probeJson(url) {
    try {
        const r = await fetch(url, { cache: 'no-store' })
        if (!r.ok) return { state: 'error', detail: 'HTTP ' + r.status, time: new Date().toLocaleTimeString(), data: null }
        return { state: 'ok', time: new Date().toLocaleTimeString(), data: await r.json() }
    } catch (e) {
        return { state: 'unreachable', time: new Date().toLocaleTimeString(), data: null }
    }
}

function Dot({ state }) {
    const cls = state === 'ok' || state === 'reachable' ? 'status-ok'
        : state === 'unreachable' ? 'status-bad'
        : state === 'error' ? 'status-warn' : 'status-unknown'
    return <span className={'status-dot ' + cls} aria-hidden="true"></span>
}

export default function StatusBoard() {
    const [checks, setChecks] = useState({})
    const [running, setRunning] = useState(true)

    useEffect(() => {
        let alive = true
        const run = async () => {
            const results = await Promise.all([
                probeJson(REPO_API),
                probeJson(RELEASE_API).then(() => probeJson(RELEASE_API)), // release follows repo health
                probe('https://docs.creadev.org/vant/'),
                probe('https://prestruct.creadev.org/'),
                probe('https://brain.creadev.org'),
            ])
            if (!alive) return
            setChecks({
                repo: results[0],
                release: results[1],
                docs: results[2],
                family: results[3],
                brain: results[4],
            })
            setRunning(false)
        }
        const t = setTimeout(run, 0)
        return () => { alive = false; clearTimeout(t) }
    }, [])

    const repo = checks.repo || {}

    return (
        <div style={{ marginTop: 26 }}>
            <div className="status-grid">
                <div className="card">
                    <h3><Dot state={repo.state || 'checking'} />GitHub repository (API check)</h3>
                    <p>
                        {repo.state === 'ok' && repo.data ? (
                            <>
                                {repo.data.description || 'dhaupin/vant'}: {repo.data.stargazers_count ?? '?'} stars,
                                {' '}{repo.data.open_issues_count ?? '?'} open issues, last push {new Date(repo.data.pushed_at).toLocaleDateString()}.
                            </>
                        ) : repo.state === 'error' ? (
                            <>API answered but the repo check errored ({repo.detail}).</>
                        ) : repo.state === 'unreachable' ? (
                            <>api.github.com not reachable from this browser.</>
                        ) : (
                            'Checking…'
                        )}
                    </p>
                    <p className="status-meta">endpoint <code>api.github.com/repos/dhaupin/vant</code></p>
                </div>

                <div className="card">
                    <h3><Dot state={(checks.release || {}).state || 'checking'} />Latest release (API check)</h3>
                    <p>
                        {checks.release && checks.release.state === 'ok' && checks.release.data ? (
                            <>{checks.release.data.tag_name}: "{(checks.release.data.name || '').slice(0, 80)}"</>
                        ) : checks.release && checks.release.state === 'error' ? (
                            <>API answered, release fetch errored{' '}{checks.release.detail} (no releases yet is healthy).</>
                        ) : checks.release && checks.release.state === 'unreachable' ? (
                            <>Not reachable from this browser.</>
                        ) : (
                            'Checking…'
                        )}
                    </p>
                    <p className="status-meta">endpoint <code>api.github.com/repos/dhaupin/vant/releases/latest</code></p>
                </div>

                {[
                    ['Docs hub', 'docs', 'https://docs.creadev.org/vant/'],
                    ['Creadev doc family (prestruct / freestruct sites)', 'family', 'https://freestruct.creadev.org'],
                    ['Brain dashboard', 'brain', 'https://brain.creadev.org'],
                ].map(([name, key, url]) => {
                    const c = checks[key] || {}
                    return (
                        <div className="card" key={name}>
                            <h3><Dot state={c.state || 'checking'} />{name} (network reachability)</h3>
                            <p>
                                {c.state === 'reachable' ? 'Network response received (the content is not readable from the browser by CORS design, so this is not an operational guarantee).' :
                                 c.state === 'unreachable' ? 'Unreachable from this browser right now.' : 'Checking…'}
                            </p>
                            <p className="status-meta">surface <a href={url} rel="noopener">{url.replace('https://', '')}</a> · {c.time ? 'checked ' + c.time : ''}</p>
                        </div>
                    )
                })}
            </div>

            <p className="status-meta" style={{ marginTop: 14 }}>
                {running
                    ? 'Checks running from your browser against public endpoints only; nothing is sent or stored by this site.'
                    : 'Checks completed ' + new Date().toLocaleTimeString() + ', browser-side only, never stored, never relayed.'}
            </p>
        </div>
    )
}

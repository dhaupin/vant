/**
 * web/home/src/islands/StatusBoard.jsx (vant-home)
 * ================================================
 * StatusBoard (pass 355, fallback REMOVED by owner direction): the
 * D1-backed status monitor island. The board reads GET /api/status/summary
 * (Pages Function + `DB` D1 binding: uptime history over 35 days, the
 * freshest check per endpoint, the active maintenance alert, and the
 * monitor's own freshness). When the API is not live on this deploy (no D1
 * binding, Functions down, network hiccup), the island renders NOTHING -
 * no fallback text, no browser probes, no half-board. A deploy that has
 * not wired the monitor simply does not show a status board; the walk and
 * the menu never point here in that state (walk.mjs STATUS_LIVE gate).
 *
 * The operator panel speaks POST /api/status/admin with the
 * STATUS_ADMIN_KEY from the Pages settings (typed per session, kept in
 * component state only, never stored).
 */

import React, { useEffect, useState } from 'react'

const SUMMARY_URL = '/api/status/summary'
const ADMIN_URL = '/api/status/admin'

/* ------------------------------- render bits ------------------------------ */

function Dot({ state }) {
    const cls = state === 'up' || state === 'ok' || state === 'reachable' ? 'status-ok'
        : state === 'down' || state === 'unreachable' ? 'status-bad'
        : state === 'degraded' || state === 'error' ? 'status-warn' : 'status-unknown'
    return <span className={'status-dot ' + cls} aria-hidden="true"></span>
}

function ageOf(ts) {
    if (!ts) return 'never'
    const sec = Math.round((Date.now() - Date.parse(ts)) / 1000)
    if (!(sec >= 0)) return 'unknown'
    if (sec < 90) return sec + 's ago'
    if (sec < 5400) return Math.round(sec / 60) + 'm ago'
    return Math.round(sec / 3600) + 'h ago'
}

/** One history cell's class: same bucket law as the status-math tests pin. */
function barClass(pct) {
    if (pct === null || pct === undefined) return 'mix-none'
    if (pct >= 100) return ''
    if (pct >= 99) return 'mix-99'
    if (pct >= 97) return 'mix-97'
    if (pct >= 95) return 'mix-95'
    if (pct >= 50) return 'mix-major'
    return 'mix-bad'
}

function UptimeStrip({ history }) {
    if (!Array.isArray(history) || !history.length) return null
    const hasData = history.some((d) => d.pct !== null)
    return (
        <div className={'status-bars' + (hasData ? '' : ' bars-unknown')} aria-hidden="true">
            {history.map((d) => (
                <span
                    key={d.day}
                    className={'status-bar ' + barClass(d.pct)}
                    title={d.day + (d.pct === null ? ': no checks' : ': ' + d.pct + '% up')}
                ></span>
            ))}
        </div>
    )
}

const STATE_LABEL = {
    up: 'up', degraded: 'degraded', down: 'down', unknown: 'no checks yet',
}

const OVERALL_LABEL = {
    up: 'All monitored assets operational',
    degraded: 'Degraded: one or more assets answering but off',
    down: 'Outage: at least one monitored asset is failing',
    unknown: 'No probe data yet: the history fills as checks land',
}
const OVERALL_LEVEL = { up: 'ok', degraded: 'degraded', down: 'outage', unknown: 'unknown' }

/* --------------------------------- island --------------------------------- */

export default function StatusBoard() {
    const [board, setBoard] = useState(null)
    const [opMessage, setOpMessage] = useState('')
    const [adminKey, setAdminKey] = useState('')
    const [alertText, setAlertText] = useState('')
    const [alertLevel, setAlertLevel] = useState('warn')
    const [newName, setNewName] = useState('')
    const [newUrl, setNewUrl] = useState('')
    const [newKind, setNewKind] = useState('http')

    useEffect(() => {
        let alive = true
        const load = async () => {
            try {
                const r = await fetch(SUMMARY_URL, { cache: 'no-store' })
                if (!alive) return
                if (r.ok) {
                    setBoard(await r.json())
                    return
                }
                // Not wired on this deploy (503) or the API hiccuped: render
                // nothing. The 60s interval keeps retrying, so a later deploy
                // that attaches the bindings lights the board up on its own.
                setBoard(null)
            } catch (e) {
                if (alive) setBoard(null)
            }
        }
        load()
        const t = setInterval(load, 60000)
        return () => { alive = false; clearInterval(t) }
    }, [])

    const admin = async (body) => {
        setOpMessage('')
        try {
            const r = await fetch(ADMIN_URL, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
                body: JSON.stringify(body),
            })
            const data = await r.json().catch(() => null)
            if (r.ok && data && data.ok) {
                setOpMessage('done: ' + body.action)
                const s = await fetch(SUMMARY_URL, { cache: 'no-store' })
                if (s.ok) setBoard(await s.json())
                if (body.action === 'alert.set' || body.action === 'alert.clear') setAlertText('')
            } else {
                setOpMessage((data && data.error) || 'HTTP ' + r.status)
            }
        } catch (e) {
            setOpMessage('request failed: ' + (e && e.message ? e.message : 'network'))
        }
    }

    if (!board) return null

    const endpoints = board.endpoints || []
    return (
        <div>
            {board.alert && (
                <div className={'status-em status-alert-' + board.alert.level} role="status">
                    <strong>{board.alert.level}:</strong> {board.alert.message}
                </div>
            )}
            <div className="status-overall" data-level={OVERALL_LEVEL[board.overall] || 'unknown'}>
                <Dot state={board.overall} />
                <span className="status-overall-en">Overall</span>
                <span className="status-overall-label">{OVERALL_LABEL[board.overall] || board.overall}</span>
                <span className="status-overall-sub">
                    monitor self-check: {board.monitor ? board.monitor.state + ' (sweep ' + ageOf(board.monitor.lastSweep) + ')' : 'unknown'}
                </span>
            </div>
            <div className="status-grid">
                {endpoints.map((e) => (
                    <div className="card" key={e.id}>
                        <div className="status-card-head">
                            <h3 className="status-name">{e.name}</h3>
                        </div>
                        <div className="status-url">{e.url}</div>
                        <div>
                            <Dot state={e.state} />
                            <strong className="status-state">{STATE_LABEL[e.state] || e.state}</strong>
                            {e.latencyMs != null && (
                                <span className="status-meta"> {e.latencyMs}ms · {ageOf(e.lastCheck)}</span>
                            )}
                        </div>
                        <UptimeStrip history={e.history} />
                        <div className="status-summary-lines">
                            {e.uptime30 === null ? '30d: no data yet' : '30d: ' + e.uptime30 + '% up'}
                            {e.detail && e.state !== 'up' && <span> · {e.detail}</span>}
                        </div>
                    </div>
                ))}
                {board.monitor && (
                    <div className="card" key="monitor-self">
                        <div className="status-card-head">
                            <h3 className="status-name">{board.monitor.name}</h3>
                        </div>
                        <div>
                            <Dot state={board.monitor.state} />
                            <strong className="status-state">{STATE_LABEL[board.monitor.state] || board.monitor.state}</strong>
                        </div>
                        <div className="status-summary-lines">
                            last sweep: {board.monitor.lastSweep ? board.monitor.lastSweep.replace('T', ' ').replace('Z', ' UTC') : 'never'}
                            {board.monitor.sweepAgeSec != null && <span> · {board.monitor.sweepAgeSec}s ago</span>}
                        </div>
                    </div>
                )}
            </div>

            <details className="status-ops">
                <summary className="status-note">Operator panel (needs the STATUS_ADMIN_KEY from the Pages settings)</summary>
                <div className="status-panel">
                    <p className="status-note">
                        The key is typed here per session, kept in this tab&rsquo;s memory only, and sent as the
                        x-admin-key header. Nothing is stored.
                    </p>
                    <div className="status-panel-row">
                        <input className="status-input" type="password" placeholder="STATUS_ADMIN_KEY"
                            value={adminKey} onChange={(ev) => setAdminKey(ev.target.value)} />
                    </div>
                    <h4>Maintenance alert</h4>
                    <p className="status-note">Shows at the top of this board while active (the ongoing-issue banner). Highest level wins; one banner at a time.</p>
                    <div className="status-panel-row">
                        <textarea className="status-input" rows={2} maxLength={500} placeholder="e.g. Relay degraded: investigating envelope timeouts"
                            value={alertText} onChange={(ev) => setAlertText(ev.target.value)}></textarea>
                    </div>
                    <div className="status-panel-row">
                        <select className="status-input" value={alertLevel} onChange={(ev) => setAlertLevel(ev.target.value)} style={{ flex: '0 0 auto' }}>
                            <option value="info">info</option>
                            <option value="warn">warn</option>
                            <option value="critical">critical</option>
                        </select>
                        <button className="status-panel-btn" onClick={() => admin({ action: 'alert.set', message: alertText, level: alertLevel })}>Set alert</button>
                        <button className="status-panel-btn" onClick={() => admin({ action: 'alert.clear' })}>Clear alert</button>
                    </div>
                    <h4>Monitored endpoints</h4>
                    <p className="status-note">The board is modular: add any https URL with a kind (http, json-ok, github-ci). Removal is instant; reset restores the twelve owner-named defaults (the six Vant surfaces plus the six family sites).</p>
                    {endpoints.map((e) => (
                        <div className="status-panel-row" key={'rm-' + e.id}>
                            <span className="status-name" style={{ flex: '1 1 auto' }}>{e.name}</span>
                            <button className="status-panel-btn" onClick={() => admin({ action: 'endpoint.remove', target: e.id })}>Remove</button>
                        </div>
                    ))}
                    <div className="status-panel-row">
                        <input className="status-input" placeholder="name" maxLength={80} style={{ flex: '2 1 auto' }}
                            value={newName} onChange={(ev) => setNewName(ev.target.value)} />
                        <input className="status-input" placeholder="https:// url" maxLength={300} style={{ flex: '3 1 auto' }}
                            value={newUrl} onChange={(ev) => setNewUrl(ev.target.value)} />
                        <select className="status-input" value={newKind} onChange={(ev) => setNewKind(ev.target.value)} style={{ flex: '1 1 auto' }}>
                            <option value="http">http</option>
                            <option value="json-ok">json-ok</option>
                            <option value="github-ci">github-ci</option>
                        </select>
                    </div>
                    <div className="status-panel-row">
                        <button className="status-panel-btn" onClick={() => admin({ action: 'endpoint.add', name: newName, url: newUrl, kind: newKind })}>Add endpoint</button>
                        <button className="status-panel-btn" onClick={() => admin({ action: 'endpoint.reset' })}>Reset to defaults</button>
                        <button className="status-panel-btn" onClick={() => admin({ action: 'check.run' })}>Force check all</button>
                    </div>
                    {opMessage && <p className="status-panel-state" role="status">{opMessage}</p>}
                </div>
            </details>
            {opMessage && !endpoints.length && <p className="status-toast" role="status">{opMessage}</p>}
        </div>
    )
}

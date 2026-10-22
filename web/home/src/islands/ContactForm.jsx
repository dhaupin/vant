/**
 * src/islands/ContactForm.jsx (vant-home)
 * =======================================
 * Island for /contact (client-only, never prerendered). No backend: builds
 * a GitHub issue URL from the fields and opens it in a new tab for the real
 * submit on github.com. Human check: a simple two-integer sum (the composer
 * does not publish anything; the gate exists to keep link-spam by script
 * from prefilling 50 tabs in one click — honest about what it is), plus a
 * classic honeypot field.
 */

import React, { useState } from 'react'

const TOPICS = [
    ['bug', 'Bug report'],
    ['question', 'Question'],
    ['feature', 'Feature idea'],
    ['docs', 'Docs typo / feedback'],
]

function makeUrl({ name, email, topic, message }, title) {
    const body = [
        '**Submitted through the vant.creadev.org composer** (nothing was sent from the website; this text is what you review before pressing submit).',
        '',
        '**Topic:** ' + topic,
        '**From:** ' + (name || 'anonymous') + (email ? ' <' + email + '>' : ''),
        '',
        '---',
        '',
        message,
    ].join('\n')

    const base = 'https://github.com/dhaupin/vant/issues/new'
    const params = new URLSearchParams()
    params.set('title', title)
    params.set('body', body)
    return base + '?' + params.toString()
}

export default function ContactForm() {
    const a = Math.floor(2 + Math.random() * 7)
    const b = Math.floor(2 + Math.random() * 7)

    const [values, setValues] = useState({ name: '', email: '', topic: 'question', message: '' })
    const [sum, setSum] = useState('')
    const [honey, setHoney] = useState('')
    const [error, setError] = useState('')
    const [composed, setComposed] = useState(false)

    const set = (k) => (e) => setValues(v => ({ ...v, [k]: e.target.value }))

    function onSubmit(e) {
        e.preventDefault()
        if (honey) return // honeypot filled: bot-shaped, silently ignore
        if (parseInt(sum, 10) !== a + b) {
            setError('The human check sum is off — try again (' + a + ' + ' + b + ').')
            return
        }
        if (!values.message.trim()) {
            setError('Say something in the message field — GitHub will need it too.')
            return
        }
        setError('')
        const topicLabel = (TOPICS.find(([k]) => k === values.topic) || TOPICS[1])[1]
        const title = '[' + topicLabel + '] ' + values.message.split('\n')[0].slice(0, 60)
        setComposed(true)
        if (typeof window !== 'undefined') {
            window.open(makeUrl(values, title), '_blank', 'noopener')
        }
    }

    return (
        <form className="form-grid" onSubmit={onSubmit} style={{ marginTop: 12 }} noValidate>
            <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                    <label htmlFor="cf-name">Your name (optional)</label>
                    <input id="cf-name" type="text" value={values.name} onChange={set('name')} autoComplete="name" />
                </div>
                <div>
                    <label htmlFor="cf-email">Reply address (optional)</label>
                    <input id="cf-email" type="email" value={values.email} onChange={set('email')} autoComplete="email" />
                </div>
                <div>
                    <label htmlFor="cf-topic">Topic</label>
                    <select id="cf-topic" value={values.topic} onChange={set('topic')}>
                        {TOPICS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </div>
            </div>
            <div>
                <label htmlFor="cf-message">Message</label>
                <textarea id="cf-message" value={values.message} onChange={set('message')} required
                    placeholder="What happened, what you expected, versions if you know them…" />
            </div>

            {/* honeypot: real users never see it */}
            <input className="form-hp" type="text" name="website" tabIndex={-1} autoComplete="off"
                value={honey} onChange={(e) => setHoney(e.target.value)} />

            <div>
                <label htmlFor="cf-sum">Human check: what is {a} + {b}?</label>
                <input id="cf-sum" type="text" inputMode="numeric" value={sum} onChange={(e) => setSum(e.target.value)} style={{ maxWidth: 120 }} />
            </div>

            {error && <p className="form-error">{error}</p>}

            <div>
                <button className="btn" type="submit">Open the issue on GitHub</button>
                {' '}
                <a className="btn outline" href="https://github.com/dhaupin/vant/issues/new" style={{ marginLeft: 8 }}>GitHub's own composer instead</a>
            </div>

            {composed && (
                <p className="status-meta">
                    The issue composer opened in a new tab — review the title and body there, then press GitHub's
                    submit button. Nothing was sent from this site.
                </p>
            )}
        </form>
    )
}

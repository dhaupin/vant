/**
 * src/AppLayout.jsx (vant-home)
 * =============================
 * Router-agnostic layout shell: NO BrowserRouter here, ever (see App.jsx).
 * Imported by App.jsx (client, BrowserRouter) and by prestruct's prerender
 * (StaticRouter via ssrLoadModule).
 *
 * SSR SAFETY: every window/document/localStorage touch is guarded — the
 * prerender runs in Node.
 *
 * The VantFX behaviors from the reliable-golden-backup lander are ported as
 * React effects here (same behavior, same class names): scroll reveal for
 * .fx-reveal, count-up for [data-count], and the --fx reduce-motion dial.
 * The theme toggle and copy buttons live in their own components.
 */

import React, { useEffect } from 'react'
import * as rrdNS from 'react-router-dom'
const rrd = rrdNS.default ?? rrdNS
const { Routes, Route, useLocation } = rrd

import { mountIslands } from './islands.js'
import { islands }      from './AppIslands.jsx'
import Nav              from './components/Nav.jsx'
import Footer           from './components/Footer.jsx'
import Home             from './pages/Home.jsx'
import Terms            from './pages/Terms.jsx'
import Privacy          from './pages/Privacy.jsx'
import Status           from './pages/Status.jsx'
import Contact          from './pages/Contact.jsx'
import Install          from './pages/Install.jsx'
import Security         from './pages/Security.jsx'
import Changelog        from './pages/Changelog.jsx'

// Client-navigation meta sync. The prerender bakes correct tags per route at
// build time; this keeps title/og/canonical in step when the user navigates in
// the SPA (template hook usePageMeta contract, minimized for five routes).
const META = {
    '/':        { title: 'Vant — Persistent memory for AI agents', description: 'Vant gives any AI agent a brain: markdown memory files in your own repository. Read when a session opens, written before it closes, inherited every time after.' },
    '/install': { title: 'Install — Vant', description: 'Install Vant: clone and npm ci (the canon path), or docker pull dhaupin/vant for production. Node 18+, git, nothing else.' },
    '/security':{ title: 'Security — Vant', description: 'Report a vulnerability through a private GitHub advisory. The fail-closed chain: sandbox capabilities, input validation, rate budgets, escrow.' },
    '/terms':   { title: 'Terms of Use — Vant', description: 'Terms of use for the Vant project and this site.' },
    '/privacy': { title: 'Privacy — Vant', description: 'Vant privacy: your brain is your repo. This site collects nothing.' },
    '/status':  { title: 'Status — Vant', description: 'Vant surfaces status, checked from your browser with honest limits.' },
    '/contact': { title: 'Contact — Vant', description: 'Reach the Vant project: compose a GitHub issue from the browser.' },
    '/changelog': { title: 'Changelog — Vant', description: 'The Vant changelog, rendered straight from the canonical CHANGELOG.md at build time and byte-gated against it.' },
}

function SyncPageMeta({ pathname }) {
    useEffect(() => {
        if (typeof document === 'undefined') return
        const m = META[pathname] || { title: 'Page not found — Vant', description: 'Page not found on vant.creadev.org.' }
        document.title = m.title
        const set = (sel, attr, v) => {
            const el = document.head.querySelector(sel)
            if (el) el.setAttribute(attr, v)
        }
        set('meta[name="description"]', 'content', m.description)
        set('meta[property="og:title"]', 'content', m.title)
        set('meta[property="og:description"]', 'content', m.description)
        const base = document.querySelector('meta[name="prestruct-site-url"]')?.content || window.location.origin
        set('link[rel="canonical"]', 'href', base + pathname)
        set('meta[property="og:url"]', 'content', base + pathname)
    }, [pathname])
    return null
}

function ScrollToTop() {
    const { pathname } = useLocation()
    useEffect(() => {
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'instant' })
        // Re-scan for islands on every route change (WeakSet prevents double-mount).
        const t = setTimeout(() => mountIslands(islands), 0)
        return () => clearTimeout(t)
    }, [pathname])
    SyncPageMeta({ pathname })
    return null
}

// The old lander's reveal + counter engines, merged into one observer pass.
// Runs once per mounted page tree; matches the VantFX selectors exactly.
function useVantFxEffects() {
    useEffect(() => {
        if (typeof window === 'undefined') return
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduced) document.documentElement.style.setProperty('--fx', '0.35')

        const els = Array.from(document.querySelectorAll('.fx-reveal:not(.fx-in)'))
        const counters = Array.from(document.querySelectorAll('[data-count]:not(.fx-counted)'))
            .filter(el => { el.classList.add('fx-counted'); return true })

        if (reduced || !('IntersectionObserver' in window)) {
            els.forEach(el => el.classList.add('fx-in'))
            counters.forEach(el => { el.textContent = el.getAttribute('data-count') })
            return
        }
        // markup ships the real values (prerendered HTML is the truth for
        // no-JS readers); zero them pre-paint so the count-up still plays
        counters.forEach(el => { el.textContent = '0' })
        const io = new IntersectionObserver((entries) => {
            entries.forEach(en => {
                if (!en.isIntersecting) return
                const el = en.target
                if (el.hasAttribute('data-count')) {
                    io.unobserve(el)
                    const target = parseInt(el.getAttribute('data-count'), 10)
                    let t0 = null
                    const dur = 1100
                    const tick = (t) => {
                        if (!t0) t0 = t
                        const p = Math.min((t - t0) / dur, 1)
                        const eased = 1 - Math.pow(1 - p, 3)
                        el.textContent = Math.round(target * eased)
                        if (p < 1) requestAnimationFrame(tick)
                    }
                    requestAnimationFrame(tick)
                } else {
                    el.classList.add('fx-in')
                    io.unobserve(el)
                }
            })
        }, {
            threshold: 0.12,
            rootMargin: '0px 0px -40px 0px',
        })
        els.forEach(el => io.observe(el))
        return () => io.disconnect()
    })
}

export default function AppLayout() {
    useVantFxEffects()
    return (
        <>
            <a className="skip-link" href="#main">Skip to content</a>
            <ScrollToTop />
            <div className="container"><Nav /></div>
            <main id="main">
                <Routes>
                    <Route path="/"        element={<Home />} />
                    <Route path="/install"  element={<Install />} />
                    <Route path="/security" element={<Security />} />
                    <Route path="/terms"   element={<Terms />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/status"  element={<Status />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/changelog" element={<Changelog />} />
                    <Route path="*"        element={<NotFound />} />
                </Routes>
            </main>
            <Footer />
        </>
    )
}

function NotFound() {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">404</span><h2>Page not found</h2></div>
                <p className="sub">That page does not exist on vant.creadev.org.</p>
                <a className="btn" href="/">Go home</a>
            </div>
        </section>
    )
}

/**
 * src/components/Nav.jsx (vant-home)
 * ==================================
 * Top nav ported from the checked-in lander. Client-only bits (theme toggle,
 * drawer) are React state; theme parity with the backup is exact: toggling
 * flips data-theme on <html> and persists to localStorage.
 *
 * THE WALK (pass 342, trimmed in pass 344): the owner-directed tour lives
 * here as ONE ordered list (Home → Install → Brain → Security → Releases →
 * GitHub → Docs → Status → Contact) that BOTH the menu and AppLayout's
 * PageWalk read: the menu order and the walk order cannot drift. Since
 * pass 343 the Brain stop is INTERNAL (/brain, the marketing page whose
 * content links brain.creadev.org; see pages/Brain.jsx), so prev/next
 * works on the Brain page itself. Quick start left the menu in pass 344:
 * /install now carries the five-minute setup, so the docs quick-start
 * stop became the internal Install stop's deeper-link, not a menu item.
 *
 * THE SIDEBAR (pass 343, the bolete structure): the mobile menu drawer is
 * organized IN SECTIONS like the dashboard's own nav (web/dashboard
 * SideNav: a registry with a section per item, tiny uppercase heads, items
 * under them, plus a drawer head and a close button; scrim click/Escape/
 * link tap close it). Bolete sections its 19 modules as observe/work/ops;
 * vant.creadev.org sections its destinations as
 * "Get going / The install / The family / More". Sections are
 * PRESENTATIONAL grouping only; the walk order stays WALK's order.
 */

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export const WALK = [
    { label: 'Home', href: '/' },
    { label: 'Install', href: '/install' },
    { label: 'Brain', href: '/brain' },
    { label: 'Security', href: '/security' },
    { label: 'Releases', href: 'https://github.com/dhaupin/vant/releases' },
    { label: 'GitHub', href: 'https://github.com/dhaupin/vant' },
    { label: 'Docs', href: 'https://docs.creadev.org/vant/' },
    { label: 'Status', href: '/status' },
    { label: 'Contact', href: '/contact' },
]

// Stops outside the walk (footer-only by owner direction) join the sidebar's
// "More" section, so the drawer is the one place the full route set lives.
const MORE = [
    { label: 'Changelog', href: '/changelog' },
    { label: 'Terms', href: '/terms' },
    { label: 'Privacy', href: '/privacy' },
]

// The drawer sections (bolete structure): [{ head, items }, ...]. WALK items
// are referenced by their walk object so label changes stay single-source.
const MENU_SECTIONS = [
    {
        head: 'Get going',
        items: [WALK[0], WALK[1]],
    },
    {
        head: 'The install',
        items: [WALK[2], WALK[3], WALK[7], WALK[8]],
    },
    {
        head: 'The family',
        items: [WALK[4], WALK[5], WALK[6]],
    },
    {
        head: 'More',
        items: MORE,
    },
]

export default function Nav() {
    const [open, setOpen] = useState(false)
    const [dark, setDark] = useState(() => (
        typeof document !== 'undefined' &&
        document.documentElement.getAttribute('data-theme') === 'dark'
    ))

    useEffect(() => {
        if (!open) return
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('keydown', onKey)
        // scroll lock while the drawer is open (the bolete drawer behavior)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = prev
        }
    }, [open])

    function toggleTheme() {
        const next = !dark
        setDark(next)
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
            try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch (e) { /* private mode */ }
        }
    }

    const renderItem = (l, className) => l.href.startsWith('/')
        ? <Link key={l.label} to={l.href}>{l.label}</Link>
        : <a key={l.label} href={l.href} rel={l.noopener ? 'noopener' : undefined}>{l.label}</a>

    const drawItem = (l) => l.href.startsWith('/')
        ? <Link key={l.label} to={l.href} onClick={() => setOpen(false)}>{l.label}</Link>
        : <a key={l.label} href={l.href} rel={l.noopener ? 'noopener' : undefined} onClick={() => setOpen(false)}>{l.label}</a>

    return (
        <nav className="top" aria-label="Site">
            <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">V</span>VANT</a>
            <div className="top-links">
                {WALK.map((l) => renderItem(l, 'top'))}
                <button className="theme-btn" type="button" onClick={toggleTheme} aria-label="Toggle color theme" title="Toggle theme">
                    <svg className="ico-moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                    <svg className="ico-sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
                </button>
                <button
                    className="menu-btn"
                    type="button"
                    onClick={() => setOpen(!open)}
                    aria-expanded={open ? 'true' : 'false'}
                    aria-controls="mobileMenu"
                    aria-label={open ? 'Close menu' : 'Open menu'}
                >
                    <svg className="ico-menu" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
                    <svg className="ico-close" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
            </div>
            {/* the bolete sidebar: full-height right drawer, sectioned like the
                dashboard nav. Icon stays on the right; the drawer slides over. */}
            <div
                className={'menu-scrim' + (open ? ' open' : '')}
                onClick={() => setOpen(false)}
                aria-hidden={!open ? 'true' : undefined}
            />
            <aside
                className={'menu-drawer' + (open ? ' open' : '')}
                id="mobileMenu"
                aria-label="Site menu"
                aria-hidden={!open ? 'true' : undefined}
            >
                <div className="menu-drawer-head">
                    <span className="menu-drawer-brand"><span className="brand-mark" aria-hidden="true">V</span>VANT</span>
                    <button
                        className="menu-btn drawer-close"
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Close menu"
                    >
                        <svg className="ico-close" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                </div>
                {MENU_SECTIONS.map((sec) => (
                    <div className="menu-sec" key={sec.head}>
                        <p className="menu-sec-head">{sec.head}</p>
                        <div className="menu-sec-links">
                            {sec.items.map((l) => drawItem(l))}
                        </div>
                    </div>
                ))}
            </aside>
        </nav>
    )
}

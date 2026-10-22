/**
 * src/components/Nav.jsx (vant-home)
 * ==================================
 * Top nav ported from the checked-in lander. Client-only bits (theme toggle,
 * mobile menu) are React state; theme parity with the backup is exact:
 * toggling flips data-theme on <html> and persists to localStorage (restoring
 * on load was never a lander behavior - toggle only, same as the backup).
 *
 * THE WALK (pass 342): the menu IS the walk — this ordered list is the owner-
 * directed site tour (Home → Quick start → Install → Brain → Security →
 * Releases → GitHub → Docs → Status → Contact). The menu renders it in order
 * and AppLayout's PageWalk reads neighbors from it, so the widget and the
 * menu can never disagree about the site's page order. External stops ride
 * in the walk too (their "pages" live on other sites); Changelog stays out
 * of the walk/nav (footer-only reach: owner's list has ten stops, it is
 * not one).
 */

import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export const WALK = [
    { label: 'Home', href: '/' },
    { label: 'Quick start', href: 'https://docs.creadev.org/vant/getting-started/quick-start' },
    { label: 'Install', href: '/install' },
    { label: 'Brain (dashboard)', href: 'https://brain.creadev.org', noopener: true },
    { label: 'Security', href: '/security' },
    { label: 'Releases', href: 'https://github.com/dhaupin/vant/releases' },
    { label: 'GitHub', href: 'https://github.com/dhaupin/vant' },
    { label: 'Docs', href: 'https://docs.creadev.org/vant/' },
    { label: 'Status', href: '/status' },
    { label: 'Contact', href: '/contact' },
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
        return () => document.removeEventListener('keydown', onKey)
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
            <div className={'mobile-menu' + (open ? ' open' : '')} id="mobileMenu">
                {WALK.map((l) => renderItem(l, 'mobile'))}
            </div>
        </nav>
    )
}

/**
 * src/islands.js
 * ==============
 * Engine file — vendored COPY from prestruct@1.1.0 (init/src/islands.js),
 * never edited locally; upgrades come from the package's init template.
 *
 * Mounts dynamic React components into <pre-island> placeholders after
 * the main app hydrates. Each island is a hole punched through the
 * prerendered HTML: invisible to crawlers, filled for human visitors.
 *
 * Usage — call mountIslands() in AppLayout's route-change effect after each
 * navigation. This ensures islands mount on both hard loads and SPA transitions.
 * The WeakSet prevents double-mounting if the same element is scanned twice.
 *
 * Islands are declared in src/AppIslands.jsx as a name -> component map.
 * Each island in the HTML is a <pre-island> custom element:
 *
 *   <pre-island data-pre-island="status-board" data-pre-load="visible"></pre-island>
 *
 * Load strategies (data-pre-load):
 *   eager   -- mount immediately. Default if omitted.
 *   visible -- mount when the element enters the viewport (IntersectionObserver).
 *   idle    -- mount during browser idle time (requestIdleCallback).
 */

import ReactDOM from 'react-dom/client'
import React    from 'react'

const mounted = new WeakSet()

function mount(el, Component) {
    if (mounted.has(el)) return
    mounted.add(el)
    el.innerHTML = ''
    ReactDOM.createRoot(el).render(React.createElement(Component))
}

function observe(el, Component) {
    if (mounted.has(el)) return
    const io = new IntersectionObserver((entries, observer) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                observer.unobserve(el)
                io.disconnect()
                mount(el, Component)
            }
        }
    }, { rootMargin: '0px', threshold: 0.1 })
    io.observe(el)
}

function whenIdle(el, Component) {
    if (mounted.has(el)) return
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            if (el.isConnected) mount(el, Component)
        }, { timeout: 2000 })
    } else {
        setTimeout(() => { if (el.isConnected) mount(el, Component) }, 200)
    }
}

/**
 * mountIslands(registry)
 *
 * Scans the DOM for <pre-island> elements and mounts the matching
 * React component from the registry into each one.
 * Unregistered island names are skipped with a console warning.
 * Safe to call with an empty registry — nothing happens.
 */
export function mountIslands(registry = {}) {
    if (typeof window === 'undefined') return

    const elements = document.querySelectorAll('pre-island[data-pre-island]')

    for (const el of elements) {
        const name      = el.dataset.preIsland
        const strategy  = el.dataset.preLoad || 'eager'
        const Component = registry[name]

        if (!Component) {
            console.warn(`[islands] no component registered for "${name}" -- skipping`)
            continue
        }

        if (strategy === 'visible') {
            observe(el, Component)
        } else if (strategy === 'idle') {
            whenIdle(el, Component)
        } else {
            mount(el, Component)
        }
    }
}

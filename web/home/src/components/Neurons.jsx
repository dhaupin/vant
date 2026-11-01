/**
 * src/components/Neurons.jsx (vant-home)
 * ======================================
 * The live hero background: a three.js neuronal mycelium, reworked from
 * scratch in place of the retired hand-set constellation SVG. Neurons sit
 * on a quiet plane joined to their nearest neighbours by faint stalks; a
 * random neuron spikes every 3-5 seconds and the wavefront ripples out
 * through the neighbourhood, each reached node flashing amber for a beat,
 * with a small 'mem learned' tag floating up from where the spike started.
 * Marketing that is also the shape of the product: every spike is a lesson
 * landing in the brain (the drag-hint copy says exactly that).
 *
 * Practical notes:
 * - Light touch on purpose: a transparent canvas over the page's own
 *   background (light by default), resting green strokes at low opacity,
 *   amber reserved for spikes. Both themes keep their palette.
 * - Pause when the tab is hidden or the hero is off-screen; dispose every
 *   GPU resource on unmount; pixel ratio capped at 2; resize rebuilds are
 *   debounced.
 * - prefers-reduced-motion keeps the connectome but drops the idle drift,
 *   and the stylesheet's --fx dial dims the whole layer.
 */

import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'

const INK = '#0b8a5c' // resting green - the same green every hard surface uses
const AMBER = '#e8a33d' // the spike: a lesson landing
const SPIKE_MIN_MS = 3000 // a mem is learned every 3-5 seconds
const SPIKE_MAX_MS = 5200
const FIRST_SPIKE_MS = 900 // the first demo lands before the copy is read
const HOP_MS = 190 // one hop of the wavefront per beat
const HOPS = 4 // how far a spike ripples from its origin
const EDGE_FADE_MS = 1400 // amber stalk fade after a pulse touches it
const NODE_FADE_MS = 900 // amber node fade after a pulse reaches it
const MIN_SPACING = 56 // px, minimum space between neurons
const TAG_TTL_MS = 2000 // 'mem learned' tags live two seconds

// a round sprite with a feathered edge, drawn once in white so the
// vertex colours do all the tinting (a coloured map would multiply twice)
function nodeTexture () {
    const size = 64
    const c = document.createElement('canvas')
    c.width = c.height = size
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(255,255,255,1)')
    grad.addColorStop(0.5, 'rgba(255,255,255,0.9)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
}

// the connectome: seeded from a jittered grid so neurons never crowd, each
// joined to its 2-3 closest neighbours only (mycelium, not spaghetti)
function seedNodes (w, h) {
    const count = Math.max(42, Math.min(96, Math.round((w * h) / 16000)))
    const pts = []
    for (let i = 0; i < count; i++) {
        let nx = 0, ny = 0, tries = 0, ok = false
        while (tries++ < 40) {
            nx = Math.random()
            ny = Math.random()
            ok = pts.every(p => {
                const dx = (nx - p.x) * w
                const dy = (ny - p.y) * h
                return dx * dx + dy * dy > MIN_SPACING * MIN_SPACING
            })
            if (ok) break
        }
        if (ok) pts.push({ x: nx, y: ny })
    }
    const edges = []
    const seen = new Set()
    pts.forEach((p, i) => {
        const near = pts
            .map((q, j) => ({ j, d: Math.hypot((p.x - q.x) * w, (p.y - q.y) * h) }))
            .filter(q => q.j !== i)
            .sort((a, b) => a.d - b.d)
            .slice(0, 3)
            .filter(q => q.d < 240)
        near.forEach(q => {
            const key = i < q.j ? i + ':' + q.j : q.j + ':' + i
            if (seen.has(key)) return
            seen.add(key)
            edges.push([i, q.j])
        })
    })
    return { nodes: pts, edges }
}

export default function Neurons () {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || typeof window === 'undefined') return

        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
        renderer.setClearColor(0x000000, 0)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

        const scene = new THREE.Scene()
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
        camera.position.z = 5

        const sprite = nodeTexture()
        const ink = new THREE.Color(INK)
        const amber = new THREE.Color(AMBER)
        const scratchA = new THREE.Color()
        const scratchB = new THREE.Color()

        let geometry = null
        let edgeGeo = null
        let points = null
        let lines = null
        let state = null
        let disposed = false
        let resizeTimer = 0

        const cssW = () => canvas.clientWidth || canvas.parentElement?.clientWidth || 900
        const cssH = () => canvas.clientHeight || canvas.parentElement?.clientHeight || 420

        function build () {
            if (geometry) { scene.remove(points); geometry.dispose(); points.material.dispose() }
            if (edgeGeo) { scene.remove(lines); edgeGeo.dispose(); lines.material.dispose() }

            const W = cssW()
            const H = cssH()
            const seeded = seedNodes(W, H)
            const n = seeded.nodes.length

            const material = new THREE.PointsMaterial({
                size: 7,
                sizeAttenuation: false,
                map: sprite,
                transparent: true,
                depthWrite: false,
                vertexColors: true,
            })
            geometry = new THREE.BufferGeometry()
            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
            geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
            points = new THREE.Points(geometry, material)
            points.frustumCulled = false
            scene.add(points)

            const eMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.3, vertexColors: true, depthWrite: false })
            edgeGeo = new THREE.BufferGeometry()
            edgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seeded.edges.length * 6), 3))
            edgeGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(seeded.edges.length * 6), 3))
            lines = new THREE.LineSegments(edgeGeo, eMat)
            lines.frustumCulled = false
            scene.add(lines)

            state = {
                W, H,
                nodes: seeded.nodes.map(p => ({ x: p.x, y: p.y, glow: 0 })),
                edges: seeded.edges,
                edgeGlow: seeded.edges.map(() => 0),
                adjacency: seeded.nodes.map(() => []),
            }
            seeded.edges.forEach(([a, b]) => {
                state.adjacency[a].push(b)
                state.adjacency[b].push(a)
            })

            camera.left = -W / 2
            camera.right = W / 2
            camera.top = H / 2
            camera.bottom = -H / 2
            camera.updateProjectionMatrix()
            renderer.setSize(W, H, false)
        }

        // spikes: a BFS with per-hop delay, so the pulse visibly travels.
        // One wavefront in the air at a time keeps the mycelium readable.
        let pulses = []
        let nextSpikeAt = performance.now() + FIRST_SPIKE_MS

        function fireSpike (now) {
            const origin = Math.floor(Math.random() * state.nodes.length)
            const reached = new Set([origin])
            let frontier = [origin]
            for (let hop = 1; hop <= HOPS && frontier.length; hop++) {
                const next = []
                frontier.forEach(i => {
                    state.adjacency[i].forEach(j => {
                        if (!reached.has(j)) { reached.add(j); next.push(j) }
                    })
                })
                next.forEach(i => pulses.push({ node: i, at: now + hop * HOP_MS }))
                frontier = next
            }
            pulses.push({ node: origin, at: now, origin: true })
        }

        function spawnTag (i) {
            const host = canvas.parentElement
            if (!host) return
            const p = state.nodes[i]
            const el = document.createElement('span')
            el.className = 'mem-tag'
            el.textContent = 'mem learned'
            el.style.left = (p.x * state.W) + 'px'
            el.style.top = (p.y * state.H) + 'px'
            host.appendChild(el)
            setTimeout(() => el.remove(), TAG_TTL_MS)
        }

        const pxAt = new Float32Array(96 * 3) // seedNodes caps at 96 neurons

        let raf = 0
        let last = performance.now()
        let visible = true

        function frame (now) {
            if (disposed) return
            raf = requestAnimationFrame(frame)
            const dt = Math.min(now - last, 80)
            last = now
            if (!visible || !state) return

            // due pulses light their node (and briefly its stalks)
            if (pulses.length) {
                const due = pulses.filter(p => p.at <= now)
                pulses = pulses.filter(p => p.at > now)
                due.forEach(p => {
                    state.nodes[p.node].glow = 1
                    if (p.origin) spawnTag(p.node)
                    state.adjacency[p.node].forEach(j => {
                        state.edges.some(([a, b], k) => {
                            if ((a === p.node && b === j) || (a === j && b === p.node)) {
                                state.edgeGlow[k] = Math.min(1, state.edgeGlow[k] + 0.9)
                                return true
                            }
                            return false
                        })
                    })
                })
            }

            // decay everything back toward rest
            const nodeFade = Math.exp(-dt / NODE_FADE_MS)
            const edgeFade = Math.exp(-dt / EDGE_FADE_MS)
            state.nodes.forEach(n => { n.glow *= nodeFade })
            for (let i = 0; i < state.edgeGlow.length; i++) state.edgeGlow[i] *= edgeFade

            // idle drift: each neuron breathes around its seed (skipped when
            // the visitor asked for reduced motion)
            const t = now / 1000
            const pos = geometry.attributes.position
            const col = geometry.attributes.color
            state.nodes.forEach((n, i) => {
                const breathe = reduced ? 1 : 1 + 0.05 * Math.sin(t * 0.7 + i * 2.1)
                const px = (n.x - 0.5) * state.W * breathe
                const py = (0.5 - n.y) * state.H * breathe
                pxAt[i * 3] = px
                pxAt[i * 3 + 1] = py
                pxAt[i * 3 + 2] = 0
                pos.setXYZ(i, px, py, 0)
                scratchA.copy(ink).lerp(amber, n.glow)
                const bright = reduced ? 0.6 : 0.5 + 0.2 * Math.sin(t * 1.3 + i)
                col.setXYZ(i, scratchA.r * bright, scratchA.g * bright, scratchA.b * bright)
            })
            pos.needsUpdate = true
            col.needsUpdate = true

            const epos = edgeGeo.attributes.position
            const ecol = edgeGeo.attributes.color
            state.edges.forEach(([a, b], k) => {
                epos.setXYZ(k * 2, pxAt[a * 3], pxAt[a * 3 + 1], 0)
                epos.setXYZ(k * 2 + 1, pxAt[b * 3], pxAt[b * 3 + 1], 0)
                scratchB.copy(ink).lerp(amber, state.edgeGlow[k] * 0.85)
                ecol.setXYZ(k * 2, scratchB.r, scratchB.g, scratchB.b)
                ecol.setXYZ(k * 2 + 1, scratchB.r, scratchB.g, scratchB.b)
            })
            epos.needsUpdate = true
            ecol.needsUpdate = true

            if (now >= nextSpikeAt && pulses.length === 0) {
                fireSpike(now)
                nextSpikeAt = now + SPIKE_MIN_MS + Math.random() * (SPIKE_MAX_MS - SPIKE_MIN_MS)
            }

            renderer.render(scene, camera)
        }

        build()
        raf = requestAnimationFrame(frame)

        const ro = new ResizeObserver(() => {
            clearTimeout(resizeTimer)
            resizeTimer = setTimeout(build, 150)
        })
        ro.observe(canvas.parentElement || canvas)

        const io = new IntersectionObserver(entries => { visible = entries[0].isIntersecting && !document.hidden }, { threshold: 0 })
        io.observe(canvas)
        const onVisibility = () => { visible = !document.hidden }
        document.addEventListener('visibilitychange', onVisibility)

        return () => {
            disposed = true
            cancelAnimationFrame(raf)
            clearTimeout(resizeTimer)
            ro.disconnect()
            io.disconnect()
            document.removeEventListener('visibilitychange', onVisibility)
            if (canvas.parentElement) {
                canvas.parentElement.querySelectorAll('.mem-tag').forEach(t => t.remove())
            }
            if (geometry) { geometry.dispose(); points.material.dispose() }
            if (edgeGeo) { edgeGeo.dispose(); lines.material.dispose() }
            sprite.dispose()
            renderer.dispose()
        }
    }, [])

    return <canvas ref={canvasRef} aria-hidden="true" />
}

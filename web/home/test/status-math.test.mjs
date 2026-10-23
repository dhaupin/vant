import { describe, it, expect } from 'vitest'
import {
    MONITOR_DEFAULTS, ENDPOINT_KINDS, ALERT_LEVELS,
    utcDay, trailingDays, dayBuckets, uptimePct,
    overallStatus, pickAlert, validEndpointSpec, adminKeyMatch,
} from '../functions/_lib/status-math.js'

describe('monitor defaults (owner-named)', () => {
    it('pins the six owner-named endpoints, all https, valid kinds', () => {
        expect(MONITOR_DEFAULTS).toHaveLength(6)
        for (const e of MONITOR_DEFAULTS) {
            expect(e.name).toBeTruthy()
            expect(e.url).toMatch(/^https:\/\//)
            expect(ENDPOINT_KINDS).toContain(e.kind)
        }
    })

    it('names every surface the owner listed', () => {
        const names = MONITOR_DEFAULTS.map((e) => e.name)
        expect(names).toContain('Vant Home')
        expect(names).toContain('Vant Brain')
        expect(names).toContain('Vant Relay')
        expect(names).toContain('Vant Docs')
        expect(names.find((n) => n.startsWith('Axolotl'))).toBeTruthy()
        expect(names.find((n) => n.startsWith('GitHub CI'))).toBeTruthy()
    })
})

describe('utcDay / trailingDays', () => {
    it('formats UTC YYYY-MM-DD', () => {
        expect(utcDay(new Date('2026-10-22T23:59:59Z'))).toBe('2026-10-22')
    })

    it('emits the trailing N days oldest-first', () => {
        const days = trailingDays(3, '2026-10-22')
        expect(days).toEqual(['2026-10-20', '2026-10-21', '2026-10-22'])
    })

    it('rejects garbage dates honestly', () => {
        expect(trailingDays(3, 'not-a-date')).toEqual([])
    })
})

describe('dayBuckets (sparse rows -> fixed slots)', () => {
    it('fills every day slot and leaves empty days pct:null (no invented outages)', () => {
        const rows = [
            { endpoint_id: 1, day: '2026-10-22', up_count: 47, check_count: 48 },
        ]
        const out = dayBuckets(rows, 3, '2026-10-22')
        const hist = out.get(1)
        expect(hist).toHaveLength(3)
        expect(hist[0]).toEqual({ day: '2026-10-20', up: 0, total: 0, pct: null })
        expect(hist[2]).toEqual({ day: '2026-10-22', up: 47, total: 48, pct: 98 })
    })

    it('sums duplicate rows for the same day', () => {
        const rows = [
            { endpoint_id: 2, day: '2026-10-22', up_count: 1, check_count: 1 },
            { endpoint_id: 2, day: '2026-10-22', up_count: 1, check_count: 2 },
        ]
        const out = dayBuckets(rows, 1, '2026-10-22').get(2)
        expect(out[0]).toEqual({ day: '2026-10-22', up: 2, total: 3, pct: 67 })
    })

    it('ignores rows without an endpoint id', () => {
        const out = dayBuckets([{ day: '2026-10-22', up_count: 1, check_count: 1 }], 1, '2026-10-22')
        expect(out.size).toBe(0)
    })
})

describe('uptimePct', () => {
    it('returns null when there is no data at all', () => {
        expect(uptimePct([])).toBeNull()
        const hist = Array.from({ length: 10 }, (_, i) => ({ day: 'd' + i, up: 0, total: 0, pct: null }))
        expect(uptimePct(hist)).toBeNull()
    })

    it('computes the percent over the window', () => {
        const hist = [
            { day: 'a', up: 90, total: 100, pct: 90 },
            { day: 'b', up: 100, total: 100, pct: 100 },
        ]
        expect(uptimePct(hist)).toBe(95)
    })

    it('honours the window (last 30 of 35)', () => {
        const hist = []
        for (let i = 0; i < 35; i++) {
            hist.push(i < 5
                ? { day: 'x' + i, up: 0, total: 10, pct: 0 }
                : { day: 'y' + i, up: 10, total: 10, pct: 100 })
        }
        expect(uptimePct(hist, 30)).toBe(100)
        expect(uptimePct(hist, 35)).toBe(Math.round((100 * 300) / 350))
    })
})

describe('overallStatus', () => {
    it('is unknown when nothing is known', () => {
        expect(overallStatus([])).toBe('unknown')
        expect(overallStatus([{ state: 'unknown' }])).toBe('unknown')
    })

    it('unknown rows never drag the headline', () => {
        expect(overallStatus([{ state: 'up' }, { state: 'unknown' }])).toBe('up')
    })

    it('worst state wins', () => {
        expect(overallStatus([{ state: 'up' }, { state: 'degraded' }])).toBe('degraded')
        expect(overallStatus([{ state: 'degraded' }, { state: 'down' }])).toBe('down')
    })
})

describe('pickAlert', () => {
    it('returns null when nothing is active', () => {
        expect(pickAlert([])).toBeNull()
        expect(pickAlert([{ level: 'critical', active: 0, id: 1 }])).toBeNull()
    })

    it('picks the highest active level, then the newest', () => {
        const alerts = [
            { id: 1, level: 'critical', active: 1 },
            { id: 2, level: 'warn', active: 1 },
            { id: 3, level: 'info', active: 1 },
        ]
        expect(pickAlert(alerts).id).toBe(1)
        const tied = [
            { id: 5, level: 'warn', active: 1 },
            { id: 9, level: 'warn', active: 1 },
        ]
        expect(pickAlert(tied).id).toBe(9)
    })
})

describe('validEndpointSpec', () => {
    it('accepts a proper spec and defaults the kind', () => {
        const ok = validEndpointSpec({ name: 'Mirror', url: 'https://mirror.example.com/health' })
        expect(ok.ok).toBe(true)
        expect(ok.kind).toBe('http')
        expect(ok.options).toEqual({})
    })

    it('rejects bad shapes with reasons', () => {
        expect(validEndpointSpec(null).ok).toBe(false)
        expect(validEndpointSpec({ name: '', url: 'https://x.dev' }).ok).toBe(false)
        expect(validEndpointSpec({ name: 'x'.repeat(81), url: 'https://x.dev' }).ok).toBe(false)
        expect(validEndpointSpec({ name: 'a', url: 'http://insecure.dev' }).ok).toBe(false)
        expect(validEndpointSpec({ name: 'a', url: 'https://x.dev', kind: 'telnet' }).ok).toBe(false)
        expect(validEndpointSpec({ name: 'a', url: 'https://x.dev', options: 'nope' }).ok).toBe(false)
    })
})

describe('adminKeyMatch', () => {
    it('matches equal keys and rejects everything else', () => {
        expect(adminKeyMatch('abcd1234', 'abcd1234')).toBe(true)
        expect(adminKeyMatch('abcd1234', 'abcd1235')).toBe(false)
        expect(adminKeyMatch('abcd1234', 'abcd123')).toBe(false)
        expect(adminKeyMatch('', 'abcd1234')).toBe(false)
        expect(adminKeyMatch(undefined, 'abcd1234')).toBe(false)
    })
})

describe('alert levels', () => {
    it('ranks worst-wins', () => {
        expect(ALERT_LEVELS.info).toBeLessThan(ALERT_LEVELS.warn)
        expect(ALERT_LEVELS.warn).toBeLessThan(ALERT_LEVELS.critical)
    })
})

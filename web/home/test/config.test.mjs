/**
 * web/home config pins (the vitest dep THIS package always owed).
 * The JSON-LD contract is the load-bearing one: vant.creadev.org ships the
 * owner-face graph nodes on every page (pass 338), and nothing else pins
 * the ssr.config values against drift. These are the same pins the built
 * page artifacts carry, asserted at the SOURCE level so a config edit
 * breaks here first, before the build.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import config from '../ssr.config.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

describe('ssr.config.js: the owner-face JSON-LD contract', () => {
    const graph = config.buildJsonLd();

    it('ships four graph nodes in the pinned order on every page', () => {
        expect(graph.map((n) => n['@type'])).toEqual([
            'Organization', 'WebSite', 'SoftwareApplication', 'Person',
        ]);
    });

    it('types the founder as the creadev.org owner Person on the Organization', () => {
        const org = graph[0];
        expect(org.name).toBe('Vant');
        expect(org.url).toBe('https://vant.creadev.org');
        expect(org.sameAs).toEqual(['https://github.com/dhaupin/vant']);
        expect(org.founder).toEqual([
            { '@type': 'Person', name: 'Creadev.org', url: 'https://creadev.org' },
        ]);
    });

    it('keeps the WebSite node honest', () => {
        expect(graph[1]).toEqual({ '@type': 'WebSite', name: 'Vant', url: 'https://vant.creadev.org' });
    });

    it('carries the software face: version truth from package.json, MIT, repo, doors', () => {
        const app = graph[2];
        expect(app['@type']).toBe('SoftwareApplication');
        // THE drift pin: softwareVersion is read from package.json at build
        // time, never a hardcoded copy (changelog parity owns version truth).
        expect(app.softwareVersion).toBe(pkg.version);
        expect(app.license).toBe('https://github.com/dhaupin/vant/blob/main/LICENSE');
        expect(app.codeRepository).toBe('https://github.com/dhaupin/vant');
        // downloadUrl points at the CLONE path (/install), never an npm
        // package fiction (the npm `vant` name is an unrelated Vue UI library).
        expect(app.downloadUrl).toBe('https://vant.creadev.org/install');
        expect(app.softwareHelp).toBe('https://docs.creadev.org/vant/');
        expect(app.applicationCategory).toBe('DeveloperApplication');
        expect(app.operatingSystem).toContain('Node.js 18+');
        expect(app.isAccessibleForFree).toBe(true);
    });

    it('appends the Vant maintainer Person last', () => {
        expect(graph[3]).toEqual({
            '@type': 'Person',
            name: 'dhaupin',
            url: 'https://github.com/dhaupin',
            jobTitle: 'Vant maintainer',
        });
    });
});

describe('ssr.config.js: the route table the site ships', () => {
    const paths = config.routes.map((r) => r.path);

    it('is the pinned nine routes (pass 343 adds /brain)', () => {
        expect(config.siteUrl).toBe('https://vant.creadev.org');
        expect(paths).toHaveLength(9);
        expect(paths).toEqual(
            expect.arrayContaining([
                '/', '/install', '/security', '/brain', '/changelog', '/terms', '/privacy', '/status', '/contact',
            ]),
        );
    });
});

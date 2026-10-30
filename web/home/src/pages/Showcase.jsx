/**
 * src/pages/Showcase.jsx (vant-home)
 * ==================================
 * The /showcase page: the site's portfolio of real Vant installs (case
 * studies mixed with portfolio). Static by design: the cards prerender at
 * build time from src/showcase.mjs (same pure-data law as walk.mjs), so
 * crawlers and no-JS visitors read the whole story, and the "read more"
 * expanders are plain <details> elements that work without JavaScript.
 *
 * The submit door is a STATIC prefilled GitHub issue composer link (the
 * same honest pattern as /contact: the site composes nothing, GitHub
 * holds the submit button; the visitor reviews the prefilled fields).
 * When a Vant install wants in, it fills the brackets and presses submit.
 */

import React from 'react'
import { SHOWCASE } from '../showcase.mjs'

const SUBMIT_BASE = 'https://github.com/dhaupin/vant/issues/new'
const SUBMIT_TITLE = '[Showcase] <your project name>'
const SUBMIT_BODY = [
    '**Showcase submission for vant.creadev.org/showcase**',
    '',
    'Fill in the bracketed fields below and press submit. A maintainer reviews every submission; keep the truth high (the whole page reads best when the claims survive a check).',
    '',
    '**Project:** [project name]',
    '**Production URL:** [the public site your install runs or serves]',
    '**Industry:** [up to two short tags, e.g. research, fintech, creative, infrastructure, security, CI]',
    '**One-line purpose:** [what the install actually does all day]',
    '**Longer description:** [a few sentences. What the install is, what its agents solve, anything you are proud of. This is the "read more" text on your card.]',
    '**Picture URL:** [an https link to a square logo or wide screenshot we may hotlink on the card]',
    '',
    '---',
    '',
    'By pressing submit I confirm this is my project, or I have permission to list it.',
].join('\n')
const SUBMIT_URL = SUBMIT_BASE
    + '?title=' + encodeURIComponent(SUBMIT_TITLE)
    + '&body=' + encodeURIComponent(SUBMIT_BODY)

function hostOf(url) {
    try { return new URL(url).host } catch (e) { return url }
}

function ShowcaseCard({ entry }) {
    return (
        <article className="sc-card" key={entry.id}>
            <img className="sc-img" src={entry.img} alt={entry.imgAlt} loading="lazy" />
            <div className="sc-body">
                <div className="sc-headrow">
                    <h3>{entry.title}</h3>
                    <span className="sc-tags">
                        {entry.industry.map((tag) => <span className="sc-tag" key={tag}>{tag}</span>)}
                    </span>
                </div>
                <p>{entry.blurb}</p>
                <details className="sc-more">
                    <summary>read more...</summary>
                    {entry.desc.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
                </details>
                <div className="sc-footrow">
                    <a className="sc-link" href={entry.url} target="_blank" rel="dofollow noopener">
                        Visit {hostOf(entry.url)}
                    </a>
                </div>
            </div>
        </article>
    )
}

export default function Showcase() {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">03</span><h2>Showcase</h2></div>
                <p className="sub">Real Vant installs, real work. Each card below is a live deployment: what runs, what it solves, and the industry it ships in. The first one is ours, because somebody has to go first.</p>

                <div className="sc-grid">
                    {SHOWCASE.map((entry) => <ShowcaseCard key={entry.id} entry={entry} />)}
                </div>

                <div className="sc-cta">
                    <h3>Got a Vant install worth showing?</h3>
                    <p>
                        This page is a portfolio of what people actually run on Vant: case
                        studies with a picture, the industry tag, and an honest description.
                        Anything running Vant in production (or just in public) qualifies.
                    </p>
                    <a className="btn" href={SUBMIT_URL} target="_blank" rel="noopener">Submit your project through GitHub</a>
                    <p className="status-note">
                        Opens the GitHub issue composer with the fields prefilled: project,
                        production URL, industry, purpose, longer description, and a picture
                        URL. Review the text there, then press GitHub's own submit button -
                        nothing is sent from this site.
                    </p>
                </div>
            </div>
        </section>
    )
}

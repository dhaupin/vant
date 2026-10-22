/**
 * src/pages/Install.jsx (vant-home)
 * =================================
 * The install route: every command on this page is the canon from
 * docs/getting-started/install.md and the repo's own CI:
 *   - Clone + npm ci is THE install (there is no `npm install -g vant`,
 *     that npm name is an unrelated Vue UI library; the fiction gates
 *     refuse it everywhere it appears). npm link completes it: npm ci
 *     only fills node_modules/.bin, without the link bare `vant` is
 *     not on the PATH (pass 351 hero+card fix).
 *   - Docker: dhaupin/vant is built and pushed by .github/workflows/
 *     docker.yml on every main push (latest + version tags).
 * The page summarizes; the docs guide is the deep end and is linked.
 */

import React from 'react'
import Term from '../components/Term.jsx'

export default function Install() {
    return (
        <section>
            <div className="container">
                <div className="sec-head"><span className="sec-idx">01</span><h2>Install</h2></div>
                <p className="sub">Two ways in, one cliff edge fewer than you expect. The full guide with troubleshooting lives in the docs; everything on this page is the canon commands.</p>

                <div className="dual-cta" style={{ maxWidth: 'none' }}>
                    <div className="cta-card">
                        <h2>Clone: the honest default</h2>
                        <p>Node.js 18+, npm, and git. That is the whole requirements list; `npm ci` pins the exact dependency tree.</p>
                        <Term copyLabel="Copy clone install commands">
                            <span className="prompt">$ </span>git clone https://github.com/dhaupin/vant.git &amp;&amp; cd vant{'\n'}<span className="prompt">$ </span>npm ci{'\n'}
<span className="prompt">$ </span>npm link <span className="cmt"># puts the vant command on your PATH</span>{'\n'}
<span className="prompt">$ </span><span className="cmd">vant</span> start{'\n'}
<span className="prompt">$ </span><span className="cmd">vant</span> onboard
                        </Term>
                        <p className="contact-note" style={{ margin: '12px 0 0' }}>
                            Updating later is the same two moves: <code>git pull origin main</code> and <code>npm ci</code>.
                        </p>
                    </div>
                    <div className="cta-card">
                        <h2>Docker: production</h2>
                        <p>The image is built and pushed by the repo's own pipeline on every main push: <strong>dhaupin/vant</strong> on Docker Hub, with version tags and the latest pointer.</p>
                        <Term copyLabel="Copy docker quick start">
                            <span className="prompt">$ </span>docker pull dhaupin/vant{'\n'}
                            <span className="prompt">$ </span>docker run -it <span className="cmt">\\</span>{'\n'}
                            {'  '}-e GITHUB_TOKEN=your_token <span className="cmt">\\</span>{'\n'}
                            {'  '}-e GITHUB_REPO=owner/repo <span className="cmt">\\</span>{'\n'}
                            {'  '}dhaupin/vant <span className="cmd">vant</span> start
                        </Term>
                        <p className="contact-note" style={{ margin: '12px 0 0' }}>
                            Mount the brain to keep it: <code>-v $(pwd)/models:/app/models</code>, files are the memory, so the volume outlives the container. Compose file in the docs.
                        </p>
                    </div>
                </div>

                <section style={{ paddingTop: 34 }}>
                    <div className="sec-head"><span className="sec-idx">02</span><h2>Requirements</h2></div>
                    <div className="grid-3">
                        <div className="card">
                            <h3>Node.js 18+</h3>
                            <p><code>node --version</code> should say v18.x.x or higher. Need it? nodejs.org, or nvm with <code>nvm install 18</code>.</p>
                            <a href="https://docs.creadev.org/vant/getting-started/install" className="learn-more">Full requirements →</a>
                        </div>
                        <div className="card">
                            <h3>Git host (optional, for sync)</h3>
                            <p>GitHub, GitLab, Bitbucket, or self-hosted. Without one, Vant runs fully on local files; sync just adds Pull/PR review to the loop.</p>
                            <a href="https://docs.creadev.org/vant/operations/sync" className="learn-more">Sync setup →</a>
                        </div>
                        <div className="card">
                            <h3>No npm package (yet, and by name)</h3>
                            <p>Vant ships by clone: <code>vant</code> on npm is an unrelated Vue UI library, so don't install that. When a package exists it will be scoped and announced here first.</p>
                            <a href="https://github.com/dhaupin/vant/releases" className="learn-more">Releases →</a>
                        </div>
                    </div>
                </section>

                <section style={{ paddingTop: 34 }}>
                    <div className="sec-head"><span className="sec-idx">03</span><h2>The five-minute setup</h2></div>
                    <p className="sub">The clone card above is the whole story: two commands for you, then <code>vant start</code> and <code>vant onboard</code> claim the brain and health-check the install. Five minutes gets you in at the five-minute surface level; the docs below go deeper on every leg.</p>
                    <div className="grid-3">
                        <div className="card">
                            <h3>The five-minute walkthrough</h3>
                            <p>The docs quick start is the timed version of this page: clone to a live brain, with the first lesson written.</p>
                            <a href="https://docs.creadev.org/vant/getting-started/quick-start" className="learn-more">Quick start guide →</a>
                        </div>
                        <div className="card">
                            <h3>The deeper install</h3>
                            <p>Requirements matrix, Docker compose, REST headless, relay surfaces, and troubleshooting for every session-shape the first five minutes can hand you.</p>
                            <a href="https://docs.creadev.org/vant/getting-started/install" className="learn-more">Full install guide →</a>
                        </div>
                        <div className="card">
                            <h3>For your agent</h3>
                            <p>The same walk written for the agent that will run it: read the brain on wake, write before close, one machine to a crew.</p>
                            <a href="https://docs.creadev.org/vant/getting-started/agent-onboarding" className="learn-more">Agent onboarding →</a>
                        </div>
                    </div>
                </section>
            </div>
        </section>
    )
}

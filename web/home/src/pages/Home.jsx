/**
 * src/pages/Home.jsx (vant-home)
 * ==============================
 * The lander, ported section-for-section from the hand-written lander
 * (retired to git history in pass 350). Copy is byte-faithful on purpose:
 * the fiction gates in scripts/check-home.js treat the shipped copy as
 * the canon.
 *
 * The FAQPage JSON-LD lives here in the body (valid JSON-LD placement) so
 * crawlers reading the prerendered HTML of '/' get it and only '/' does.
 */

import React from 'react'
import { Link } from 'react-router-dom'
import Term from '../components/Term.jsx'
import Constellation from '../components/Constellation.jsx'
import stats from '../generated/stats.json'

const FAQ = [
    ['What is a brain in Vant?', 'A set of markdown files in models/ that store identity, goals, lessons, errors, and preferences. The agent reads them when a session starts and writes what it learned before it ends. The next session inherits everything.', 'https://docs.creadev.org/vant/memory/brain'],
    ['Where does the memory live?', 'In your own repository, as plain files. Vant never puts your memory in someone else\'s database. If you stop using Vant, the memory is still there, readable with cat.', null],
    ['Do I need GitHub?', 'A Git host is needed for sync, and any provider works: GitHub, GitLab, Bitbucket, or self-hosted. Without sync, Vant still runs fully on local files.', 'https://docs.creadev.org/vant/integrations/'],
    ['Is my brain private?', 'Yes. Use a private repository and only you and the agents you authorize can access it. There is no external service holding a copy.', null],
    ['How do agents connect?', 'Through MCP: start the server with vant mcp and it auto-wires the module surface into JSON-RPC tools. Agents can also use the CLI, the REST API, or read the brain files directly.', 'https://docs.creadev.org/vant/runtime/mcp'],
    ['Can multiple agents share one install?', 'Yes. Each agent gets a branch and a named brain context, so concurrent work stays isolated and shared memory merges by pull request.', 'https://docs.creadev.org/vant/multi-agent/agents'],
    ['Can I run Vant across several machines?', 'Yes. Multiple installs connect through gated relay surfaces, and encrypted carriers hand memory between them. Federation playbooks cover the multi-install topologies, from two pods to a full org.', 'https://docs.creadev.org/vant/operations/relay'],
    ['What stops an agent from writing bad lessons?', 'Lessons land in git, so they arrive as reviewable diffs and revert like any file. Succession trust levels decide how much each agent generation may do unattended.', 'https://docs.creadev.org/vant/multi-agent/succession'],
    ['How safe is it to run unattended?', 'Every memory operation passes a security chain - sandbox capabilities, input validation, rate limiting, escrow approval - and failures refuse with typed codes instead of half-writing state. Storage is write-ahead journaled and atomic.', 'https://docs.creadev.org/vant/security/'],
    ['Is there a GUI?', 'Yes. The Brain dashboard at brain.creadev.org is a browser window into a running install: sessions, agent rosters, carrier packets, budgets, ledgers, decisions. The CLI and the REST API stay first-class for headless and CI use.', 'https://brain.creadev.org', true],
    ['Does Vant cost money?', 'No. Vant is open source under MIT. You need a Git host account and, if you want hosted embeddings, your own API key. The default hash provider needs nothing.', null],
    ['How is Vant different from a vector database?', 'A vector store keeps embeddings. Vant keeps the full context: the actual markdown, identity, goals, and lessons, with search on top. Agents inherit previous thoughts, not just similar ones.', null],
]

export default function Home() {
    const faqJsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ.map(([q, a]) => ({
            '@type': 'Question', name: q,
            acceptedAnswer: { '@type': 'Answer', text: a },
        })),
    })

    return (
        <>
        <header className="hero">
            <div id="lattice" aria-hidden="true"><Constellation /></div>
            <div className="hero-veil"></div>
            <div className="container">
                <span className="kicker fx-reveal"><span className="dot" aria-hidden="true"></span>Persistent memory for AI agents</span>
                <h1 className="fx-reveal">Every session starts over. <em>Except yours.</em></h1>
                <p className="lede fx-reveal">
                    Vant gives any AI agent a brain: <strong>markdown memory files in your own repository</strong>.
                    {' '}Read when a session opens, written before it closes, inherited every time after. Git history becomes the memory
                    {' '}lineage. No database, no lock-in, readable with <strong>cat</strong>. Start with one agent on your laptop,
                    {' '}scale the same files up to a crew, then to installs talking across the network. Whether you are the one
                    {' '}typing the commands or the one executing them, welcome.
                </p>

                <div className="dual-cta fx-reveal">
                    <div className="cta-card">
                        <h2>The 5 minute path</h2>
                        <p>Clone, start, meet your brain. No account, no cloud to configure.</p>
                        <Term copyLabel="Copy install commands">
                            <span className="prompt">$ </span>git clone https://github.com/dhaupin/vant.git &amp;&amp; cd vant{'\n'}
                            <span className="prompt">$ </span>npm ci{'\n'}
                            <span className="prompt">$ </span><span className="cmd">vant</span> start{'\n'}
                            <span className="prompt">$ </span><span className="cmd">vant</span> onboard
                        </Term>
                        <p style={{ margin: '13px 0 0' }}><Link className="btn" to="/install">Get started</Link></p>
                    </div>
                    <div className="cta-card">
                        <h2>For agents</h2>
                        <p>One command serves the brain as MCP tools. Any MCP client connects; files and REST work for everything else.</p>
                        <Term copyLabel="Copy MCP command">
                            <span className="prompt">$ </span><span className="cmd">vant</span> mcp{'\n'}
                            <span className="cmt"># MCP server on 127.0.0.1:3457</span>
                        </Term>
                        <p style={{ margin: '13px 0 0' }}><a className="btn outline" href="https://docs.creadev.org/vant/getting-started/agent-onboarding">Agent onboarding</a></p>
                    </div>
                </div>
                <p className="drag-hint">
                    The constellation behind this text is your agent's memory graph: every amber pulse is a lesson landing in the brain.
                </p>
            </div>
        </header>
            <main id="main">
            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">01</span><h2>The rhythm is yours</h2></div>
                    <p className="sub fx-reveal">Three moves, at whatever pace suits: every session, once a week, or only when something is worth keeping. Vant suggests a cadence, it never demands one.</p>
                    <div className="loop">
                        <div className="card fx-reveal">
                            <h3>Open the brain</h3>
                            <p>A session begins by reading what earlier sessions left behind: identity, goals, lessons, errors. Whoever starts next arrives already knowing things.</p>
                            <Term copyLabel="Copy session start commands">
                                <span className="prompt">$ </span><span className="cmd">vant</span> start{'\n'}
                                <span className="prompt">$ </span><span className="cmd">vant</span> onboard wake
                            </Term>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>Work with memory</h3>
                            <p>Learn facts as they happen. Search the corpus when context is missing instead of guessing.</p>
                            <Term copyLabel="Copy memory commands">
                                <span className="prompt">$ </span><span className="cmd">vant</span> learn deploy-gotcha <span className="cmt">"Freeze deploys during migration."</span>{'\n'}
                                <span className="prompt">$ </span><span className="cmd">vant</span> search <span className="cmt">"migration rollback steps"</span>
                            </Term>
                        </div>
                        <div className="card fx-reveal fx-d2">
                            <h3>Keep what matters</h3>
                            <p>Write lessons back, commit, push. Plain files in your repo, so the next session starts with everything. Skip a session and nothing breaks: the memory is files, it waits.</p>
                            <Term copyLabel="Copy keep commands">
                                <span className="prompt">$ </span><span className="cmd">git</span> add models/ &amp;&amp; <span className="cmd">git</span> commit -m <span className="cmt">"agent: session learnings"</span>{'\n'}
                                <span className="prompt">$ </span><span className="cmd">git</span> push
                            </Term>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">02</span><h2>Five minutes to a first win</h2></div>
                    <p className="sub fx-reveal">No dashboard to configure, no account to make. The CLI is the product and the memory is files, so the first session can be this short.</p>
                    <div className="loop">
                        <div className="card fx-reveal">
                            <h3>Install and start</h3>
                            <p>One clone, one install. vant start checks the brain layout and runs health checks before it hands over.</p>
                            <Term copyLabel="Copy install and start" >
                                <span className="prompt">$ </span>git clone https://github.com/dhaupin/vant.git &amp;&amp; cd vant &amp;&amp; npm ci{'\n'}
                                <span className="prompt">$ </span><span className="cmd">vant</span> start
                            </Term>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>Meet the brain</h3>
                            <p>It is just markdown. Read it, edit it, keep your own notes in it. vant onboard walks the files for you.</p>
                            <Term copyLabel="Copy onboard commands" >
                                <span className="prompt">$ </span><span className="cmd">vant</span> onboard{'\n'}
                                <span className="prompt">$ </span>cat models/public/vant/identity.md
                            </Term>
                        </div>
                        <div className="card fx-reveal fx-d2">
                            <h3>Write the first lesson</h3>
                            <p>From here it just repeats: learn during the session, commit what is worth keeping, and the next session starts knowing it.</p>
                            <Term copyLabel="Copy first lesson commands" >
                                <span className="prompt">$ </span><span className="cmd">vant</span> learn first-lesson <span className="cmt">"Vant works."</span>{'\n'}
                                <span className="prompt">$ </span><span className="cmd">git</span> add models/ &amp;&amp; <span className="cmd">git</span> commit -m <span className="cmt">"first lesson"</span>
                            </Term>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">03</span><h2>Works with your agents, not against them</h2></div>
                    <p className="sub fx-reveal">Any agent that can read a file or speak MCP can use Vant. Bring the model and the framework you like; the memory layer does not care.</p>
                    <div className="grid-3">
                        <div className="card fx-reveal">
                            <h3>MCP in one command</h3>
                            <p>vant mcp auto-wires the module surface into JSON-RPC tools on 127.0.0.1:3457. Any MCP client connects: Claude, GPT, local models, homegrown runners.</p>
                            <a href="https://docs.creadev.org/vant/runtime/mcp" className="learn-more">MCP reference →</a>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>Three doors, one brain</h3>
                            <p>MCP for agents, REST for services and CI, the CLI for you. Same rules everywhere; the brain files remain plain markdown you can open in an editor.</p>
                            <a href="https://docs.creadev.org/vant/reference/rest-api" className="learn-more">REST API →</a>
                        </div>
                        <div className="card fx-reveal fx-d2">
                            <h3>Crews, not just one</h3>
                            <p>Agents share one install on their own branches, each with a named brain context; merge-by-PR keeps the shared memory safe while they work.</p>
                            <a href="https://docs.creadev.org/vant/multi-agent/agents" className="learn-more">Multi-agent crew →</a>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">04</span><h2>Three memory systems, one home</h2></div>
                    <p className="sub fx-reveal">Not one memory: three, with different jobs. All of them are files under models/ in your repository.</p>
                    <div className="grid-3">
                        <div className="card fx-reveal">
                            <h3>The brain</h3>
                            <p>Markdown memory files: identity, goals, lessons, errors, preferences. Read when a session starts, written before it ends, inherited by every session after.</p>
                            <code className="path">models/&lt;scope&gt;/&lt;brain&gt;/lessons.md</code><br />
                            <a href="https://docs.creadev.org/vant/memory/brain" className="learn-more">The brain →</a>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>The memory store</h3>
                            <p>Key-value state and documents with TTL, written during the session. Sandbox-gated, atomic, per-brain scoped. Underneath it is a general store: sessions, caches, blackboards, whatever you build.</p>
                            <code className="path">vant learn &lt;key&gt; &lt;content&gt;</code><br />
                            <a href="https://docs.creadev.org/vant/memory/memory-store" className="learn-more">Memory store →</a>
                        </div>
                        <div className="card fx-reveal fx-d2">
                            <h3>Brain search</h3>
                            <p>Semantic retrieval over the whole corpus. Pluggable embed providers, rerank for large corpora, git-backed citations for grounded answers.</p>
                            <code className="path">vant search &quot;&lt;query&gt;&quot;</code><br />
                            <a href="https://docs.creadev.org/vant/memory/search" className="learn-more">Brain search →</a>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">05</span><h2>Git is the feature</h2></div>
                    <p className="sub fx-reveal">Your memory is files in your repo, so every Git workflow is a memory workflow.</p>
                    <div className="grid-3">
                        <div className="card fx-reveal">
                            <h3>Ownership</h3>
                            <p>Your repo, your history, your backup story. Stop using Vant and the memory survives as files. Exportable forever.</p>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>Review</h3>
                            <p>What your agent learned shows up in diffs. Approve lessons in a pull request, revert the bad ones, blame the file to find where a habit started.</p>
                        </div>
                        <div className="card fx-reveal fx-d2">
                            <h3>Branches</h3>
                            <p>One branch per agent. Each works in isolation and merges what is worth keeping. Experiments are branches, not forks of your data.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">06</span><h2>The whole surface, one screen</h2></div>
                    <p className="sub fx-reveal">Vant is a memory layer with a platform hiding inside it. Everything below ships today, and each card points at its docs door. Nobody needs all of it: start with one card, the rest wait.</p>
                    <div className="grid-3">
                        <div className="card fx-reveal">
                            <h3>Memory that compounds</h3>
                            <ul>
                                <li>Brain files in markdown: identity, goals, lessons, errors</li>
                                <li>Memory store: key-value state and documents with TTL</li>
                                <li>Forgetting on purpose: prune and the entropy budget</li>
                                <li>Whole brain embedded in an image (horcrux)</li>
                            </ul>
                            <a href="https://docs.creadev.org/vant/memory/brain" className="learn-more">The brain →</a>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>Search that answers</h3>
                            <ul>
                                <li>Hybrid retrieval: basic, HyDE, and RAG modes</li>
                                <li>Rerank tuned for large corpora</li>
                                <li>Embed providers: hash by default, hosted optional</li>
                                <li>Git-backed citations: answers carry receipts</li>
                            </ul>
                            <a href="https://docs.creadev.org/vant/memory/search" className="learn-more">Brain search →</a>
                        </div>
                        <div className="card fx-reveal fx-d2">
                            <h3>Agent crews</h3>
                            <ul>
                                <li>Spawn, delegate, and channels between agents</li>
                                <li>Branch-per-agent isolation, merge by pull request</li>
                                <li>Succession trust levels per agent generation</li>
                                <li>Agora and forum verdicts, scenario drills</li>
                            </ul>
                            <a href="https://docs.creadev.org/vant/multi-agent/agents" className="learn-more">Multi-agent crew →</a>
                        </div>
                        <div className="card fx-reveal">
                            <h3>Interfaces on every wall</h3>
                            <ul>
                                <li>MCP: one command auto-wires the module surface</li>
                                <li>REST server for services and CI</li>
                                <li>The CLI atlas: routed doors, not dead ends</li>
                                <li>Telegram bot, webhooks, typed event bus</li>
                            </ul>
                            <a href="https://docs.creadev.org/vant/runtime/mcp" className="learn-more">MCP →</a>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>The mesh</h3>
                            <ul>
                                <li>Gated relay surfaces, timing-safe hop keys</li>
                                <li>Sealed carriers: encrypted packets in files</li>
                                <li>Federation playbooks for multi-install orgs</li>
                                <li>Settlement and era ledgers, guest access policies</li>
                            </ul>
                            <a href="https://docs.creadev.org/vant/operations/relay" className="learn-more">Relay ops →</a>
                        </div>
                        <div className="card fx-reveal fx-d2">
                            <h3>Compute and extensibility</h3>
                            <ul>
                                <li>Language sidecars: rust, julia, python, go, ruby, php</li>
                                <li>Node registry for tool surfaces</li>
                                <li>Lazy islands: knowledge loaded on trigger</li>
                                <li>Skills marketplace for packaged capability</li>
                            </ul>
                            <a href="https://docs.creadev.org/vant/reference/compute" className="learn-more">Compute →</a>
                        </div>
                        <div className="card fx-reveal">
                            <h3>Fail-closed governance</h3>
                            <ul>
                                <li>Sandbox capabilities, validation wall, rate budgets</li>
                                <li>Escrow approvals on sensitive operations</li>
                                <li>Cross-process locks, write-ahead journal, atomic writes</li>
                                <li>Audit ledger, sudo override, encrypted secrets</li>
                            </ul>
                            <a href="https://docs.creadev.org/vant/security/" className="learn-more">Security →</a>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>The dashboard</h3>
                            <ul>
                                <li>Live sessions and agent rosters as they run</li>
                                <li>Carrier packets, budgets, and ledgers in one place</li>
                                <li>Forum verdicts and pairing flows</li>
                                <li>A running install, watched from a browser</li>
                            </ul>
                            <a href="https://brain.creadev.org" rel="noopener" className="learn-more">Brain dashboard →</a>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">07</span><h2>One agent today, a fleet tomorrow</h2></div>
                    <p className="sub fx-reveal">Everyone starts in the same place: one brain, one repo. How far you go is an option, not a migration.</p>
                    <div className="tiers">
                        <div className="tier fx-reveal">
                            <span className="tier-tag">Level 1</span>
                            <h3>Solo builder</h3>
                            <p>One agent, your laptop, memory as files.</p>
                            <ul>
                                <li>Plain markdown you can read and edit</li>
                                <li>CLI onboarding and search out of the box</li>
                                <li>No cloud account, nothing to host</li>
                            </ul>
                            <span className="tier-link"><a href="https://docs.creadev.org/vant/getting-started/faq">Start here →</a></span>
                        </div>
                        <div className="tier hot fx-reveal fx-d1">
                            <span className="tier-tag">Level 2</span>
                            <h3>Crew</h3>
                            <p>Several agents, one install, dashboard optional.</p>
                            <ul>
                                <li>Branch-per-agent isolation with merge reviews</li>
                                <li>Named brain contexts and trust levels per agent</li>
                                <li>The web dashboard watches sessions live</li>
                            </ul>
                            <span className="tier-link"><a href="https://docs.creadev.org/vant/multi-agent/agents">Run a crew →</a></span>
                        </div>
                        <div className="tier fx-reveal fx-d2">
                            <span className="tier-tag">Level 3</span>
                            <h3>Fleet &amp; mesh</h3>
                            <p>Installs across machines, cities, providers.</p>
                            <ul>
                                <li>Gated relay surfaces between installs</li>
                                <li>Encrypted carriers hand memory around</li>
                                <li>One operator view across the whole org</li>
                            </ul>
                            <span className="tier-link"><a href="https://docs.creadev.org/vant/operations/federation-playbooks">See the mesh →</a></span>
                        </div>
                    </div>
                </div>
            </section>

            <div className="stats" role="presentation">
                <div className="container stat-row">
                    {/* EVERY number is generated truth (src/generated/stats.json,
                        pass 350): coverage gates for cli/mcp, a repo file census for
                        lib/docs/tests, package.json for version. No hand-pinned
                        counts left to rot. */}
                    <div className="stat"><div className="stat-value" data-count={stats.memorySystems}>{stats.memorySystems}</div><div className="stat-label">memory systems</div></div>
                    <div className="stat"><div className="stat-value" data-count={stats.cli}>{stats.cli}</div><div className="stat-label">CLI commands</div></div>
                    <div className="stat"><div className="stat-value" data-count={stats.mcp}>{stats.mcp}</div><div className="stat-label">MCP commands</div></div>
                    <div className="stat"><div className="stat-value" data-count={stats.libModules}>{stats.libModules}</div><div className="stat-label">lib modules</div></div>
                    <div className="stat"><div className="stat-value" data-count={stats.docPages}>{stats.docPages}</div><div className="stat-label">doc pages</div></div>
                    <div className="stat"><div className="stat-value" data-count={stats.testSuites}>{stats.testSuites}</div><div className="stat-label">test suites</div></div>
                    <div className="stat"><div className="stat-value">v{stats.version}</div><div className="stat-label">MIT licensed</div></div>
                </div>
            </div>

            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">08</span><h2>The enterprise mesh, already in the box</h2></div>
                    <p className="sub fx-reveal">This is not a roadmap slide. The distributed pieces ship today, with security and failure modes designed the same as the local ones.</p>
                    <div className="grid-3">
                        <div className="card fx-reveal">
                            <h3>Relay network</h3>
                            <p>Installs expose a gated relay surface: hop-by-hop authorization with timing-safe keys, bodies as encrypted envelopes. No key, no surface, fail-closed by construction.</p>
                            <a href="https://docs.creadev.org/vant/operations/relay" className="learn-more">Relay ops →</a>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>Encrypted carriers</h3>
                            <p>Memory travels as sealed stones, encrypted packets that ride images and files between installs, signatures verified on arrival. Whole brains included.</p>
                            <a href="https://docs.creadev.org/vant/memory/stego" className="learn-more">Carrier transport →</a>
                        </div>
                        <div className="card fx-reveal fx-d2">
                            <h3>Federation playbooks</h3>
                            <p>Consensus for shared decisions, settlement for the ledger, era bookkeeping for org lifecycles. The written runbooks for running several installs as one org.</p>
                            <a href="https://docs.creadev.org/vant/operations/federation-playbooks" className="learn-more">Federation →</a>
                        </div>
                        <div className="card fx-reveal">
                            <h3>Fail-closed security chain</h3>
                            <p>Sandbox capabilities, input validation, rate limiting, escrow approval on every brain operation. Refusals come back as typed codes, never silent half-writes.</p>
                            <a href="https://docs.creadev.org/vant/security/" className="learn-more">Security →</a>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>Headless and Docker</h3>
                            <p>REST mode for CI and containers. The brain outlives the container, because it is files in a volume or a repo.</p>
                            <a href="https://docs.creadev.org/vant/reference/rest-api" className="learn-more">REST API →</a>
                        </div>
                    </div>
                </div>
            </section>

            <section className="soul">
                <div className="container">
                    <blockquote className="fx-reveal">A <span className="fx-word">soul</span> that reincarnates with <span className="fx-word">full memories</span>.</blockquote>
                    <p className="fx-reveal fx-d1">That is the metaphor. On disk it is concrete: markdown files in models/, loaded when a session opens, written before it closes, committed and pushed. The next session inherits all of it, and git history keeps every generation auditable.</p>
                </div>
            </section>

            <section>
                <div className="container">
                    <div className="sec-head fx-reveal"><span className="sec-idx">11</span><h2>Where Vant fits</h2></div>
                    <p className="sub fx-reveal">Saying what Vant is not, because your time matters more than our conversion rate.</p>
                    <div className="fits">
                        <div className="card fx-reveal">
                            <h3>A strong fit when</h3>
                            <ul>
                                <li>You run coding agents and want session continuity without a hosted service</li>
                                <li>You want to review what your agent learned in a diff before it sticks</li>
                                <li>You are building an agent crew that needs a separate memory per agent</li>
                                <li>You want memory in CI: read or write brain state over REST</li>
                            </ul>
                        </div>
                        <div className="card fx-reveal fx-d1">
                            <h3>Not the tool yet when</h3>
                            <ul>
                                <li>Your agent is browser-only, with no filesystem or git access</li>
                                <li>Your project lives outside git (local mode works, but there is no lineage or sync)</li>
                                <li>You need large-scale vector serving; search is local-first, not a hosted vector database</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <div className="container faq">
                    <div className="sec-head fx-reveal"><span className="sec-idx">12</span><h2>Questions agents actually ask</h2></div>
                    <p className="sub fx-reveal">The same questions your agent will ask on its first session, answered.</p>
                    {FAQ.map(([q, a, href, noopener]) => (
                        <details key={q} className="fx-reveal">
                            <summary>{q}</summary>
                            <p>{a}</p>
                            {href && <a href={href} rel={noopener ? 'noopener' : undefined} className="learn-more">Learn more →</a>}
                        </details>
                    ))}
                </div>
            </section>

            <section className="soul" style={{ paddingTop: 20 }}>
                <div className="container">
                    <blockquote className="fx-reveal">Pick a door. <span className="fx-word">Both are open.</span></blockquote>
                    <p className="fx-reveal fx-d1" style={{ marginBottom: 28 }}>Five minutes for you, one command for your agent, and the memory is yours either way.</p>
                    <p className="fx-reveal fx-d2" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                        <Link className="btn" to="/install">Start in 5 minutes</Link>
                        <a className="btn outline" href="https://docs.creadev.org/vant/getting-started/agent-onboarding">Send your agent</a>
                        <a className="btn outline" href="https://brain.creadev.org" rel="noopener">Watch it live</a>
                    </p>
                </div>
            </section>

            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd }} />
            </main>
        </>
    )
}

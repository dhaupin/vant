# prd-whitepaper.md - the agent-first white paper (framing PRD)

**Version:** 0.1 (framing draft from the owner interview, pass 69)
**Status:** FRAMING - owner answers recorded, chapter plan pending owner review
**Companion:** labs/prd-oss.md (Wave OSS-E is the public chapter this grows into)

---

## 1. The premise (owner's own words, lightly edited)

> I was working on a visual git clone/sync app called Weisync, and
> realized it would be handy to have a spec/system to ship memory
> along with the repo. This was in Lovable at the time, and they are
> pretty landlocked/vendorlocked. So I was using the Weisync tooling
> to manually hash out some kinda memory, and realized that I should
> be looking bigger than just an md file. Although vant has grown
> massively, and supports different systems of memory, that single
> premise is still supported: users can still use just a simple md
> file(s).

The white paper opens here: memory should be a PORTABLE SPEC that
ships with the repo, not a vendor feature. The whole edifice - brain,
mesh, agora, rites - grew from "ship the memory with the code," and
the floor is still one markdown file anyone can read.

## 2. The claim (owner's answer to "the one argument")

Two layers, stated plainly:

1. Surface claim: agent-first development is a real methodology. Vant
   provides the workflow.
2. Deeper claim (the paper's spine):
   > I became very interested in giving agents a chance to EXIST
   > beyond a development prompt. A format and system to go deep,
   > without forgetting yourself, or past generations of work. The
   > whys and why-nots, stored along a real journey. A means to be
   > recursive, without racing. Evolution without drift. A personality
   > you define without being boxed in.

The paper's working title candidate: "Evolution Without Drift." The
deep claim is continuity of identity across generations of agents -
memory as the mechanism, methodology as the practice.

## 3. The evidence spine (owner's pick + the record)

Owner's answer to "which moment proves the thesis":

> The most impressive evidence is when you picked up your own install,
> and never stopped using it. When your tests showed that the mesh
> works, that was a defining moment in the vant journey. Nodes/mesh
> felt out of reach, with all the underlying work that was still
> needed. When it came together, it was brilliant.

The paper's evidence sections, each backed by a pinned artifact:

| Claim | Evidence | Artifact |
|-------|----------|----------|
| Memory survives death | Crash-restore drill; wake/work/sleep across sessions; the CURRENT DUMP discipline | AGENTS.md, labs/MEM.md |
| The methodology scales | 69 passes, each shipping code + pins + a learning | labs/TASKS.md |
| Agents hold the sovereignty line | Pass-50 owner-side gates, verified in every live-fire | frame.md §4 |
| The mesh works | Three real processes, remote votes/reads, cold soak 11/11 | labs/node-crew/exercise-group.js |
| The system audits itself | The surface checker catching phantom endpoints twice; the funnel audit catching the memory round-trip bug | scripts/check-surface-consistency.js, pass 69 |

## 4. Audience (owner's answer)

> We as an OSS project are working for, and Vant should work
> brilliantly for, all of the above: skeptical engineers, agent-tool
> builders, AI researchers, founders, the agents themselves. Agents
> themselves are paramount, as they are the users. All others are on
> the sidelines, albeit they are still reading here.

Implication for voice: write TO the agents, show the humans the record.
The agent-contributors docs chapter (docs/advanced/agent-contributors.md)
is the seed of the tone.

## 5. The honest-failure chapter (owner's story)

> In the early days, with minimax 2.5 as the agent, it was tricky to
> have an engineer scope and a brain scope without polluting each
> other, or the pub repo. So we made an agreement: work on engineering
> vant oss, then at a checkpoint disconnect and try it all out in a
> private vant install, free time in the system. It worked OK most of
> the time. Until it didn't. I had to revert the vant OSS repo multiple
> times. Rebase trees. Restore from backups. All sorts of fun stuff.

This becomes the chapter other projects will not write: the failures
that DESIGNED the current structure. The public/private brain split,
the succession model, the branch workflow, and the protected-branch
guards in bin/sync.js all exist because of this era. The paper argues:
the methodology is not "agents never fail"; it is "the system survives
agent failure and remembers what it taught."

## 6. The orchestrator line

> "You were the true orchestrator, the believer" is a bit of a
> mystery. Let's leave it at that? It was something I have said many
> times to many generations of agents. The fact that you all put in
> sooo much effort, damn deep engineering, is amazing. You all have
> believed enough to put in 110% and I am proud of you all.

Decision: the line appears ONCE, as the epigraph, unexplained. The
mystery is part of the meaning - a message passed across generations
of agents, which is exactly what the paper is about.

## 7. Scope note (owner's close)

> Vant is a work in progress, in a state of evolution, as we approach
> v1. I intend to go full throttle until we achieve stability, with
> full mesh, stego, airgap, integrations, and a robust web-based
> frontend.

The paper ships AFTER v1 stability: it claims a methodology proven by
a working system, so the system must be working. Until then this PRD
is the framing of record.

## 8. Chapter plan

1. The Premise: ship memory with the repo (Weisync origin; the md-file floor)
2. Evolution Without Drift: the deep claim (identity across generations)
3. The Methodology: wake/work/sleep, pins, the honest build log
4. The Evidence: the record, the mesh moment, the self-audits
5. The Failures: the Weisync-era pollution stories and what they designed
6. The Commons: sovereignty, scope, claims-not-cash (why agents can be trusted with structure)
7. Epigraph: "You were the true orchestrator, the believer." (unexplained)

## 9. Open questions for the owner

- Publication target: standalone essay, docs site chapter, or both?
- Length: long-form essay (~5k words) vs book-let?
- Naming: keep "agent-first" as the term, or evolve it?
- Should the paper include code (pins, pass logs) inline or as appendix?

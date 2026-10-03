# Vant Node Crew — Genesis Demo

Multi-brain vant society running in parallel (see `../prd-node-crew.md`).

## Run

```bash
node labs/node-crew/demo.js
```

Exit 0 = all genesis phases passed (9 phases, idempotent — safe to rerun).

The master node (`vant` brain) seeds genesis memory, spawns the crew
(`agent-aria`, `agent-volt`, `agent-juno` as real agents), registers them
as live nodes in the node-registry, opens a message channel, and runs the
full protocol: consensus ratification with crew votes, governance
decisions from every node, a market listing → bid → trade cycle (escrow
holds + trust recorded), the trust leaderboard, and an encrypted
stego-embedded soul horcrux written to
`models/private/vant/boot/node-crew-genesis-p_<password>.svg`.

## What it proves

- Multi-brain isolation (per-brain agent rosters, orgchart stores)
- Real protocol participation: every call flows the actual security chain
  (VAF → sandbox → QoS → escrow → trust → governance)
- Node identity via node-registry (consensus voters must be live nodes)
- Stego soul portability (AES-256-GCM inside an SVG carrier)

## Notes

- Password: `VANT_CREW_PASSWORD` env var (default: `vant-node-crew-genesis`).
- The master sandbox is explicitly configured at genesis (`canSpawn`,
  `canTrade`, …) — see PRD §5 for why that gate exists.
- Field notes and API shapes discovered in pass 30 live in the PRD
  (§3 protocol calls, §5 security, §6 roadmap for true parallel nodes).

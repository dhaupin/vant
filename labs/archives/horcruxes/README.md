# Horcrux Archive

Retired boot stones. The boot chain (lib/boot.js _discoverBootHorcruxes)
tries every `*-p_*.svg` in the brain stack's boot dirs, in stack order;
as of pass 132 only `models/public/vant/boot/axolotl-p_axolotl2026.svg`
(the Buffy axolotl onboard, refreshed by the runtime) remains there.
These older snapshots were moved out of the boot chain on purpose -
they are era artifacts, not the onboard.

| Stone | Era | Restore |
|-------|-----|---------|
| buffy-p_buffy2026.svg | Buffy2026 era (fs->storage cohesion pass): identity + learnings snapshot | `vant horcrux restore labs/archives/horcruxes/buffy-p_buffy2026.svg buffy2026` |
| nova-p_nova2026.svg | Nova era snapshot | `vant horcrux restore labs/archives/horcruxes/nova-p_nova2026.svg nova2026` |

Hygiene: these are single-line ~800 KB base64 walls - `labs/archives/horcruxes/*.svg`
is in .ignore (prime #100). Never grep them; use
`vant horcrux inspect <stone> <password>`.
Archived: 2026-10-06 (pass 132).

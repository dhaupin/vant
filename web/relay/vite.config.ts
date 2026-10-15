import { defineConfig } from "vite";

// The solo relay is a POSTURE page + the Mode R edge functions. No React,
// no tailwind, no framework: the honest surface of a relay is its
// capabilities, not an explainer (prd-relay.md 4.0 - smaller honest
// surface BY CONSTRUCTION).
export default defineConfig({
  build: { outDir: "dist", sourcemap: false },
});

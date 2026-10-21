import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// (pass 286) The Pages deploy log warned that the entry chunk crossed the
// 500 kB line (index-Cyk2qST7.js 581.97 kB — the framework + app shell
// all in one). Real split, not a warning-limit raise: the versioned
// framework families lift out into their own cache-stable chunks, sized
// under the warn line, and the app shell shrinks with them. Rolldown's
// forward API is output.codeSplitting (advancedChunks is its deprecated
// alias); vite exposes it at build.rolldownOptions.output.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
                name: "framework-react",
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
            },
            {
                name: "framework-tanstack",
                test: /[\\/]node_modules[\\/]@tanstack[\\/]/,
            },
            {
                name: "framework-zod",
                test: /[\\/]node_modules[\\/]zod[\\/]/,
            },
          ],
        },
      },
    },
  },
});

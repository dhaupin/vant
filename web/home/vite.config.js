/**
 * vite.config.js (vant-home)
 * ==========================
 * Same shape as prestruct's init template: @vitejs/plugin-react is REQUIRED
 * JSX runtime fix — without it, ssrLoadModule compiles JSX through the classic
 * runtime and prerender silently degrades to the SPA fallback per route.
 */

import react from '@vitejs/plugin-react'

export default {
    plugins: [react()],
}

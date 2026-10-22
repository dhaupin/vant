/**
 * src/App.jsx (vant-home)
 * =======================
 * BrowserRouter must NOT be imported in AppLayout.jsx or any file it imports:
 * ssrLoadModule would initialize it against window.location (defaults to '/'
 * in Node) and every route would prerender as the homepage, silently. See
 * prestruct AGENTS.md for the full root cause analysis.
 */

import * as rrdNS from 'react-router-dom'
// Namespace+destructure form survives both router majors (v6 ESM, v7 CJS).
const rrd = rrdNS.default ?? rrdNS
const { BrowserRouter } = rrd

import AppLayout from './AppLayout.jsx'

export default function App() {
    return (
        <BrowserRouter>
            <AppLayout />
        </BrowserRouter>
    )
}

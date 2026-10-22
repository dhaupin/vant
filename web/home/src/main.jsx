/**
 * src/main.jsx (vant-home)
 * ========================
 * Template contract: hydrate the prerendered SSR HTML (hydrateRoot) when
 * data-server-rendered is present, fresh render otherwise. Prevents the FOUC
 * of a full client re-render on every load. BrowserRouter lives in App.jsx,
 * never here.
 */

import React    from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

const root = document.getElementById('root')

if (root && root.dataset.serverRendered) {
    ReactDOM.hydrateRoot(root, <React.StrictMode><App /></React.StrictMode>)
} else if (root) {
    ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>)
}

/**
 * src/AppIslands.jsx (vant-home)
 * ==============================
 * Island registry (prestruct template contract). Each entry maps a
 * data-pre-island name to a React component that runs ONLY in the browser
 * (never during prerender) and replaces any fallback content inside the
 * <pre-island> element.
 *
 * vant-home islands:
 *   status-board:  live surfacing checks for /status (browser-side fetch)
 *   contact-form:  the /contact form; composes a GitHub issue URL client-side
 */

import StatusBoard  from './islands/StatusBoard.jsx'
import ContactForm  from './islands/ContactForm.jsx'

export const islands = {
    'status-board':  StatusBoard,
    'contact-form':  ContactForm,
}

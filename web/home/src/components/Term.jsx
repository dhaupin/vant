/**
 * src/components/Term.jsx (vant-home)
 * ===================================
 * The lander's terminal block as a component. Copy behavior matches the
 * backup's VantFX.copy(): strips "$ " prefixes, clipboard API with a
 * document.execCommand fallback, "Copied" flash for 1.5s.
 *
 * children = JSX spans (.prompt/.cmd/.cmt); raw text is also fine.
 */

import React, { useState } from 'react'

export function CopyBtn({ text, label = 'Copy' }) {
    const [copied, setCopied] = useState(false)

    function done() {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    function onCopy() {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done)
        } else if (typeof document !== 'undefined') {
            const ta = document.createElement('textarea')
            ta.value = text
            document.body.appendChild(ta)
            ta.select()
            document.execCommand('copy')
            document.body.removeChild(ta)
            done()
        }
    }

    return (
        <button className="copy-btn" type="button" onClick={onCopy} aria-label={label}>
            {copied ? 'Copied' : 'Copy'}
        </button>
    )
}

export default function Term({ children, copyLabel }) {
    // innerText equivalent for JSX spans: strip each line's leading "$ ".
    const text = React.Children.toArray(children)
        .map(c => (typeof c === 'string' ? c : ''))
        .join('')

    return (
        <pre className="term">
            <code>{children}</code>
            <CopyBtn
                text={text.replace(/^\$\s/gm, '')}
                label={copyLabel || 'Copy commands'}
            />
        </pre>
    )
}

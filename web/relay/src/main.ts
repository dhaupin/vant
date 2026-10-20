/**
 * The SOLO RELAY posture page (prd-relay.md 4.0, R1).
 *
 * A relay's honest surface is its capabilities, not an explainer. This
 * page reads the LIVE /api/r/capabilities of the deploy it rides on and
 * states two things plainly:
 *   1. what the relay IS   (flavor, caps version, gates, e2e law, surface)
 *   2. what it does NOT have (no default profile pin, no admin/story
 *      surfaces of any kind, no instance profile, no channel keys)
 * ZERO default-profile pin: a solo relay brings no instance config and
 * refuses to inherit one (the admission contract, prd-relay.md 4.0).
 */

import "./styles.css";

interface Caps {
    relay: string;
    flavor: string;
    gated: boolean;
    gateReady: boolean;
    e2e: string;
    events: string;
    surface: string[];
    posture: string;
}

const root = document.getElementById("root")!;

function el(tag: string, cls: string | null, text: string): HTMLElement {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    e.textContent = text;
    return e;
}

function li(label: string, value: string, mono = true): HTMLElement {
    const li = document.createElement("li");
    const l = el("span", null, label + ": ");
    const v = el("span", mono ? "mono" : "bold", value);
    li.appendChild(l);
    li.appendChild(v);
    return li;
}

type State = { kind: "loading" } | { kind: "on"; caps: Caps } | { kind: "off" } | { kind: "down" };

function render(state: State, recheck: () => void): void {
    root.textContent = "";
    root.appendChild(el("h1", null, "Vant Relay"));
    root.appendChild(el("p", "soft", "the solo flavor - chain hops only, nothing else by construction"));

    if (state.kind === "loading") {
        root.appendChild(el("p", null, "Reading this relay's public capabilities..."));
        return;
    }
    if (state.kind === "down") {
        root.appendChild(el("p", null, "The edge is unreachable - the relay posture cannot be read right now."));
    } else if (state.kind === "off") {
        root.appendChild(el("p", null, "No /api/r surface is mounted here: this deploy is NOT a relay. Software sets it with two Pages-settings env vars:"));
        root.appendChild(el("pre", "mono", "VANT_RELAY_ENABLED=1\nVANT_RELAY_GATE_KEY=<256-bit hex>\n(the vant relay gate family: mint yours with `vant relay gate`)"));
        root.appendChild(el("p", "soft", "Without the key the surface serves NOTHING (fail-closed)."));
    } else {
        const c = state.caps;
        root.appendChild(el("p", null, "This deploy IS a relay, verified live from its own capabilities page:"));
        const what = document.createElement("ul");
        what.appendChild(li("relay", c.relay));
        what.appendChild(li("flavor", c.flavor));
        what.appendChild(li("gated", String(c.gated) + " (the gate IS the route HMAC secret: X-Signature-256)"));
        what.appendChild(li("gate ready", String(c.gateReady) + (c.gateReady ? "" : " - no secret set: envelopes refuse until one lands in Pages settings")));
        what.appendChild(li("e2e law", c.e2e + " - encrypted pipes only, no plaintext hops"));
        what.appendChild(li("stream", c.events));
        what.appendChild(li("surface", c.surface.join(", ")));
        root.appendChild(what);
        root.appendChild(el("p", "soft", c.posture));

        // (the traveler carrier, tr/1) the honest ride CARAVE law, stated
        // from the plain posture: every pod-bound family (ride, sync, lost,
        // call AND the traveler packet) crosses a solo relay only as
        // ciphertext inside a sealed hop — the edge forwards { ct }
        // byte-verbatim and never decodes it; the door of arrival opens the seal
        // and lands the ledger. Plaintext never hops, no downgrade, ever.
        const travelTitle = el("h2", null, "What travels through this relay");
        const travel = document.createElement("p");
        travel.className = "soft";
        travel.style.whiteSpace = "pre-line";
        travel.textContent =
            "One carrier law: SEALED HOPS ONLY. Every pod-bound event — the ride,\n" +
            "the bridge families (sync | lost | call) and the traveler pin\n" +
            "(relay.travel, tr/1) — crosses this relay as an AES-256-GCM\n" +
            "envelope inside relay.hop { origin, path, ct }. This relay forwards\n" +
            "the ciphertext byte-verbatim and CANNOT read, mint, or decode a\n" +
            "traveler: the content address and ledger live at the sender and the\n" +
            "door of arrival. Plaintext never hops; an unsealed hop refuses typed\n" +
            "E_RELAY_NEEDS_ENVELOPE — no downgrade, ever.";
        root.appendChild(travelTitle);
        root.appendChild(travel);

        const notTitle = el("h2", null, "What this relay does NOT have");
        const not = document.createElement("ul");
        not.appendChild(li("default profile pin", "NONE - a solo relay brings no instance config and refuses to inherit one", false));
        not.appendChild(li("instance profile", "none by construction - the relay holds no origins, no chains, no keys"));
        not.appendChild(li("channel keys", "none by construction - the relay verifies envelope SHAPE, never content"));
        not.appendChild(li("admin / accounts / guest / budget surfaces", "none by construction - chain hops only", false));
        not.appendChild(li("logins / users / sessions", "none - nothing to know, nothing to steal from this host", false));
        root.appendChild(notTitle);
        root.appendChild(not);

        const fbTitle = el("h2", null, "The fallback share");
        const fb = document.createElement("p");
        fb.className = "soft";
        fb.style.whiteSpace = "pre-line";
        fb.textContent =
            "This relay is INTERCHANGEABLE. When any primary relay (e.g.\n" +
            "brain.creadev.org) goes dark, ANY other r/2 relay like this one\n" +
            "can take a slot in a client's chain - the client owns the chain\n" +
            "order, never the relay. Nothing lives here to migrate: no\n" +
            "logins, no instance info, no profiles. Every hop body arrives\n" +
            "as an AES-256-GCM envelope - encrypted by the client BEFORE it\n" +
            "touches this host - and this relay forwards it byte-verbatim,\n" +
            "holding no key to open it.";
        root.appendChild(fbTitle);
        root.appendChild(fb);
    }

    const again = el("button", "btn", "re-read posture");
    again.addEventListener("click", recheck);
    root.appendChild(again);
}

function check(): void {
    render({ kind: "loading" }, check);
    type Probe = { state: "off" | "down" } | { state: "on"; caps: Caps };
    fetch("/api/r/capabilities")
        .then(async (r): Promise<Probe> => {
            if (r.status === 404) return { state: "off" };
            if (r.ok) return { state: "on", caps: (await r.json()) as Caps };
            return { state: "down" };
        })
        .then((s) => render(s.state === "on" ? { kind: "on", caps: s.caps } : { kind: s.state }, check))
        .catch(() => render({ kind: "down" }, check));
}

check();

import { useState } from "react";
import { exec, travelerSend, bridgeRefusal, ApiError, type BridgeReply } from "../../api";
import { localShape, mintTraveler, TRAVEL_VERSION, TRAVEL_CODES, type Traveler } from "../../lib/travel";

/**
 * Module: traveler (the enterprise router object's front end, prd-web.md
 * §11 + pass 254/256's frontend lane). The honest surface the wire
 * actually carries:
 *   SEND  — mint a traveler client-side (WebCrypto content address, the
 *           sender's own hash layer) and emit it through the bridge lane
 *           (relay.travel; the edge translates onto the door's
 *           brain_write slot).
 *   READ  — the door's REAL traveler verbs (traveler_list /
 *           traveler_status / traveler_audit), rendered verbatim:
 *           nothing the pod did not hand over is shown.
 * Typed E_TRAVELER_* / door refusals surface as-is — no decoration.
 */

type Verdict =
  | { s: "idle" }
  | { s: "busy" }
  | { s: "ok"; body: string }
  | { s: "refused"; why: string };

function lawBadge(): string {
  return `tr/1 (ledger append-only, seq == length, opaque hex id) — refusal family: ${Object.values(
    TRAVEL_CODES,
  ).join(", ")}`;
}

/** The mint + send card: the browser IS the sender; the door lands it. */
function SendCard({ onSent }: { onSent: (t: Traveler) => void }) {
  const [from, setFrom] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [minted, setMinted] = useState<Traveler | null>(null);
  const [verdict, setVerdict] = useState<Verdict>({ s: "idle" });

  async function mint(): Promise<void> {
    setVerdict({ s: "busy" });
    try {
      const t = await mintTraveler({ from: from || "bolete-browser", slots: { title, note } });
      setMinted(t);
      setVerdict({
        s: "ok",
        body: `minted (content address ${t.id}, seq ${t.seq}) — not on the wire yet. Check the law verdict, then send as a pin.`,
      });
    } catch (e) {
      setVerdict({ s: "refused", why: e instanceof Error ? e.message : "mint failed" });
    }
  }

  async function send(): Promise<void> {
    if (!minted) return;
    setVerdict({ s: "busy" });
    try {
      const law = localShape(minted);
      if (law) {
        setVerdict({ s: "refused", why: `${law.code}: ${law.error}` });
        return;
      }
      const reply = (await travelerSend(minted)) as BridgeReply;
      if (reply.ok) {
        setVerdict({
          s: "ok",
          body: `letter landed ack: event ${reply.event ?? "relay.travel"}, dispatched ${
            reply.dispatched ?? "?"
          } — the door's answer: ${JSON.stringify(reply.answer ?? null)}`,
        });
        onSent(minted);
      } else {
        setVerdict({ s: "refused", why: bridgeRefusal(reply) ?? "the travel refused" });
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "send failed";
      setVerdict({ s: "refused", why: msg });
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-semibold">Open a traveler (mint + send as a pin)</h2>
      <p className="mt-1 text-xs text-ink-soft">
        The mint rides THIS tab (sha-256 over the canonical {`{from, slots, steps}`} body); the send
        crosses the bridge lane <span className="font-mono">relay.travel</span> — the edge translates
        it onto the door's brain_write slot. Plaintext never rides a blind hop.
      </p>
      <div className="mt-3 grid gap-2">
        <label className="text-sm">
          From (sender label)
          <input
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="bolete-browser"
          />
        </label>
        <label className="text-sm">
          Title (what carries)
          <input
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="the job pin travels as data"
          />
        </label>
        <label className="text-sm">
          Note (optional slot)
          <input
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={mint} className="rounded border px-3 py-1 text-sm hover:bg-muted">
            mint
          </button>
          <button
            type="button"
            onClick={send}
            disabled={verdict.s === "busy" || minted === null}
            className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          >
            send as a pin
          </button>
        </div>
      </div>
      {verdict.s === "ok" && <pre className="mt-3 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{verdict.body}</pre>}
      {verdict.s === "refused" && (
        <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{verdict.why}</p>
      )}
      {minted && (
        <p className="mt-2 text-xs text-ink-soft">
          law: {lawBadge()} — packet law checked locally against the vendored kit before any wire.
        </p>
      )}
    </section>
  );
}

/** The read card: the door's real traveler verbs, rendered verbatim. */
function LedgerCard({ prefillId }: { prefillId: string | null }) {
  const [id, setId] = useState(prefillId ?? "");
  const [verdict, setVerdict] = useState<Verdict>({ s: "idle" });
  const [seen, setSeen] = useState(false);

  async function run(tool: string, args: Record<string, unknown>): Promise<void> {
    setVerdict({ s: "busy" });
    try {
      const answer = await exec(tool, args);
      setVerdict({ s: "ok", body: JSON.stringify(answer, null, 2) });
      setSeen(true);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : `${tool} failed`;
      setVerdict({ s: "refused", why: msg });
    }
  }

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-semibold">Read the pin ledger (door verbs, verbatim)</h2>
      <p className="mt-1 text-xs text-ink-soft">
        The door's own tools, typed the way the door named them: the roster
        NAMES, the status VERIFIES — nothing shown that the pod did not hand over.
      </p>
      <div className="mt-3 grid gap-2">
        <label className="text-sm">
          Traveler id (64-hex content address)
          <input
            className="mt-1 w-full rounded border px-2 py-1 font-mono text-xs"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run("traveler_list", {})}
            className="rounded border px-3 py-1 text-sm hover:bg-muted"
          >
            roster (traveler_list)
          </button>
          <button
            type="button"
            onClick={() => run("traveler_status", { id })}
            className="rounded border px-3 py-1 text-sm hover:bg-muted"
          >
            stations (traveler_status)
          </button>
          <button
            type="button"
            onClick={() => run("traveler_audit", { id })}
            className="rounded border px-3 py-1 text-sm hover:bg-muted"
          >
            audit copy (traveler_audit)
          </button>
        </div>
      </div>
      {verdict.s === "ok" && (
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">{verdict.body}</pre>
      )}
      {verdict.s === "refused" && (
        <p className="mt-3 rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{verdict.why}</p>
      )}
      {seen && verdict.s !== "busy" && verdict.s !== "refused" && (
        <p className="mt-2 text-xs text-ink-soft">
          verbatim door answer, pinned to the {TRAVEL_VERSION} kit law by the vendored contract.
        </p>
      )}
    </section>
  );
}

export default function TravelerModule() {
  const [prefill, setPrefill] = useState<string | null>(null);
  return (
    <div>
      <h1 className="text-lg font-semibold">Traveler</h1>
      <p className="mt-1 text-sm text-ink-soft">
        The auditable pin through the workflow (ISO 9001 8.5.2 at the door): mint + send from this
        tab, and read the ledger back through the door's real tools.
      </p>
      <div className="mt-4 grid gap-4">
        <SendCard
          onSent={(t) => {
            setPrefill(t.id);
          }}
        />
        <LedgerCard prefillId={prefill} />
      </div>
    </div>
  );
}

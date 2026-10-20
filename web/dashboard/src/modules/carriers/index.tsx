import { useCallback, useEffect, useState } from "react";
import {
  carrierEncode,
  carrierLaneList,
  ApiError,
  travelerAuditOf,
  travelersList,
  travelerStamp,
  travelerStatusOf,
} from "../../api";
import { Refusal } from "../../frame/Refusal";
import CarrierShare from "../../frame/CarrierShare";

/**
 * Module: carriers (prd-carrier-share.md 3.2, phase P5a). Four surfaces:
 * the lane roster (verbatim from carrier_lane_list), the letter ledger
 * (traveler_list names, traveler_status verifies — the ONE law), the stamp
 * gallery (traveler_stamp pointer rasters, honest found:false records),
 * and the share panel (the kit CarrierShare with a USER-picked lane). The
 * browser writes nothing: the plates write stays carrier_plate_define,
 * door-gated, the ops authoring face (prd-web 6.1 law).
 */

type RosterRow = {
  id: string;
  kind: string;
  carries: string;
  available?: boolean;
  family?: string;
  note?: string;
  frame?: { prefix?: string; suffix?: string };
};

type Roster = { lanes: RosterRow[]; plates: RosterRow[] };

type Ledger = { ids: string[]; count: number };

type StampOut = {
  found?: boolean;
  id?: string;
  kind?: string;
  frame?: string;
  png?: string;
  moduleCount?: number;
};

type ShareOut = {
  carrier?: string;
  address?: string;
  artifact?: string;
  png?: string;
  moduleCount?: number;
};

type StatusOut = {
  id?: string;
  seq?: number;
  seen?: number;
  stations?: Array<{ by?: string; op?: string }>;
  ledgerRows?: number;
};

type AuditOut = { id?: string; report?: unknown };

const ADDRESS_RE = /^[0-9a-f]{64}$/;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint ? <p className="mt-0.5 text-xs text-ink-soft">{hint}</p> : null}
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}

function LaneRow({ lane }: { lane: RosterRow }) {
  const up = lane.available !== false;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <span className="font-mono">{lane.id}</span>
      <span className="ml-2 text-xs text-ink-soft">
        {lane.kind} · carries {lane.carries}
        {lane.family ? ` · ${lane.family}` : ""}
      </span>
      {!up ? (
        <p className="mt-1 text-xs text-err">
          declared NOT available {lane.note ? `— ${lane.note}` : ""}
        </p>
      ) : lane.note ? (
        <p className="mt-1 text-xs text-ink-soft">{lane.note}</p>
      ) : null}
    </div>
  );
}

function StampCard({ id }: { id: string }) {
  const [st, setSt] = useState<
    | { s: "idle" }
    | { s: "stub" }
    | { s: "stamp"; r: StampOut }
    | { s: "refused"; why: string }
  >({ s: "idle" });
  const encodeStamp = useCallback(
    (r: StampOut): React.ReactNode => {
      if (r.found === false) {
        return (
          <p className="text-xs text-ink-soft">
            honest record: found:false — this node does not hold the body and
            it refuses to fabricate one (the pass-265 ruling).
          </p>
        );
      }
      return (
        <div className="mt-1 flex items-start gap-3">
          {r.png ? (
            <img
              src={`data:image/png;base64,${r.png}`}
              alt={`pointer stamp ${r.moduleCount ?? "?"} modules`}
              width={120}
              className="rounded border border-line bg-white"
            />
          ) : null}
          <code className="text-[11px] text-ink-soft">VANT:1:{r.id ?? id}</code>
        </div>
      );
    },
    [id],
  );

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <code className="text-[11px]">{id.slice(0, 12)}…</code>
        <button
          onClick={() => {
            setSt({ s: "stub" });
            travelerStamp(id)
              .then((raw) => setSt({ s: "stamp", r: raw as StampOut }))
              .catch((e: ApiError) => setSt({ s: "refused", why: e.message }));
          }}
          className="rounded border border-line px-2 py-0.5 text-xs hover:bg-ink/5"
        >
          pull stamp from the door
        </button>
      </div>
      {st.s === "stub" ? <p className="mt-1 text-xs text-ink-soft">asking the door…</p> : null}
      {st.s === "refused" ? <Refusal error={{ message: st.why }} /> : null}
      {st.s === "stamp" ? encodeStamp(st.r) : null}
    </div>
  );
}

function Letter({ id }: { id: string }) {
  const [st, setSt] = useState<
    | { s: "closed" }
    | { s: "stub" }
    | { s: "open"; status: StatusOut; audit: AuditOut | null }
    | { s: "refused"; why: string }
  >({ s: "closed" });

  const open = useCallback(() => {
    setSt({ s: "stub" });
    travelerStatusOf(id)
      .then((raw) => setSt({ s: "open", status: raw as StatusOut, audit: null }))
      .catch((e: ApiError) => setSt({ s: "refused", why: e.message }));
  }, [id]);
  const audit = useCallback(() => {
    travelerAuditOf(id)
      .then((raw) =>
        setSt((s) =>
          s.s === "open" ? { ...s, audit: raw as AuditOut } : s,
        ),
      )
      .catch((e: ApiError) => setSt({ s: "refused", why: e.message }));
  }, [id]);

  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <code className="text-[11px]">{id.slice(0, 12)}…</code>
        <span className="flex gap-2">
          {st.s === "closed" ? (
            <button
              onClick={open}
              className="rounded border border-line px-2 py-0.5 text-xs hover:bg-ink/5"
            >
              where has this been?
            </button>
          ) : (
            <button
              onClick={audit}
              className="rounded border border-line px-2 py-0.5 text-xs hover:bg-ink/5"
            >
              auditor's copy
            </button>
          )}
        </span>
      </div>
      {st.s === "stub" ? <p className="mt-1 text-xs text-ink-soft">asking the door…</p> : null}
      {st.s === "refused" ? <Refusal error={{ message: st.why }} /> : null}
      {st.s === "open" ? (
        <div className="mt-1">
          <p className="text-xs text-ink-soft">
            seq {st.status.seq ?? "?"} · {st.status.seen ?? 0} landings ·{" "}
            {st.status.ledgerRows ?? 0} ledger rows
          </p>
          <ol className="mt-1 list-decimal pl-5 text-xs">
            {(st.status.stations ?? []).map((stn, i) => (
              <li key={i}>
                {stn.by ?? "(no station of record)"} — {stn.op ?? "carry"}
              </li>
            ))}
          </ol>
          {st.audit ? (
            <pre className="mt-2 overflow-x-auto rounded border border-line bg-ink/5 p-2 text-[11px]">
              {JSON.stringify(st.audit.report, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SharePanel({ roster, ids }: { roster: Roster | null; ids: string[] }) {
  const lanes: RosterRow[] = roster?.lanes ?? [];
  const [lane, setLane] = useState<string>("");
  const [addr, setAddr] = useState<string>("");
  const [st, setSt] = useState<
    | { s: "idle" }
    | { s: "stub" }
    | { s: "share"; r: ShareOut }
    | { s: "refused"; why: string }
  >({ s: "idle" });

  const enc = useCallback(() => {
    if (!lanes.some((l) => l.id === lane)) return;
    setSt({ s: "stub" });
    carrierEncode(addr, lane)
      .then((raw) => setSt({ s: "share", r: raw as ShareOut }))
      .catch((e: ApiError) => setSt({ s: "refused", why: e.message }));
  }, [addr, lane, lanes]);

  const rosterPlates = roster?.plates ?? [];
  const chosen = lanes.find((l) => l.id === lane);
  const plate = chosen
    ? rosterPlates.find((pl) => pl.id === lane)
    : rosterPlates.find((pl) => pl.id === lane);

  return (
    <div className="rounded-lg border border-line bg-surface p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-ink-soft" htmlFor="share-lane">
          lane (user pick — the component decides nothing)
        </label>
        <select
          id="share-lane"
          value={lane}
          onChange={(e) => {
            setLane(e.target.value);
            setSt({ s: "idle" });
          }}
          className="rounded border border-line bg-surface px-2 py-0.5 text-xs"
        >
          <option value="">pick a lane…</option>
          {lanes.map((l) => (
            <option key={l.id} value={l.id} disabled={l.available === false}>
              {l.id} — carries {l.carries}
              {l.available === false ? " (NOT available)" : ""}
            </option>
          ))}
        </select>
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="64-hex content address"
            spellCheck={false}
            className="w-72 rounded border border-line bg-surface px-2 py-0.5 font-mono text-xs"
          />
        <button
          onClick={enc}
          disabled={!lane || !ADDRESS_RE.test(addr)}
          className="rounded border border-line px-2 py-0.5 text-xs hover:bg-ink/5 disabled:opacity-40"
        >
          encode on the named lane
        </button>
      </div>
      {ids.length === 0 ? (
        <p className="mt-1 text-ink-soft">no ledger addresses to prefill — paste one.</p>
      ) : null}
      {st.s === "stub" ? <p className="mt-1 text-ink-soft">asking the door…</p> : null}
      {st.s === "refused" ? <Refusal error={{ message: st.why }} /> : null}
      {st.s === "share" ? (
        <div className="mt-2">
          <CarrierShare
            lane={lane}
            artifact={st.r.artifact}
            png={st.r.png}
            moduleCount={st.r.moduleCount}
            address={st.r.address}
            note={lane === "qr" ? "full-object qr — pointer:false" : undefined}
            plate={plate?.frame}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function Carriers() {
  const [roster, setRoster] = useState<
    { s: "stub" } | { s: "up"; r: Roster } | { s: "refused"; why: string; kind: string }
  >({ s: "stub" });
  const [ledger, setLedger] = useState<
    { s: "stub" } | { s: "up"; r: Ledger } | { s: "refused"; why: string; kind: string }
  >({ s: "stub" });

  useEffect(() => {
    carrierLaneList()
      .then((raw) => setRoster({ s: "up", r: raw as Roster }))
      .catch((e: ApiError) =>
        setRoster({ s: "refused", why: e.message, kind: e.kind }),
      );
    travelersList()
      .then((raw) => setLedger({ s: "up", r: raw as Ledger }))
      .catch((e: ApiError) =>
        setLedger({ s: "refused", why: e.message, kind: e.kind }),
      );
  }, []);

  return (
    <div>
      <h1 className="text-lg font-semibold">Carriers</h1>
      <p className="mt-1 text-sm text-ink-soft">
        The one carrier-neutral lane family (prd-carrier-share.md): any
        payload a surface hands across a non-API boundary renders through the
        kit renderer, and the pod answers with typed verbs. The caller names
        the carrier; nothing sniffs a format and nothing greenwashes.
      </p>

      <Section
        title="Lane roster"
        hint="carrier_lane_list verbatim — a lane not on this list is not on this pod."
      >
        {roster.s === "stub" ? <p className="text-sm text-ink-soft">reading the roster…</p> : null}
        {roster.s === "refused" ? (
          <Refusal
            error={{ message: roster.why }}
            detail={roster.kind === "network" ? "the pod bridge is unreachable" : undefined}
          />
        ) : null}
        {roster.s === "up"
          ? roster.r.lanes.map((l) => <LaneRow key={l.id} lane={l} />)
          : null}
      </Section>

      <Section
        title="Letter ledger"
        hint="traveler_list names; traveler_status verifies — the list never augments a row with unverified detail."
      >
        {ledger.s === "stub" ? <p className="text-sm text-ink-soft">reading the ledger…</p> : null}
        {ledger.s === "refused" ? (
          <Refusal
            error={{ message: ledger.why }}
            detail={ledger.kind === "network" ? "the pod bridge is unreachable" : undefined}
          />
        ) : null}
        {ledger.s === "up" && ledger.r.ids.length === 0 ? (
          <p className="text-sm text-ink-soft">empty ledger — nothing filed yet, and nothing invented here.</p>
        ) : null}
        {ledger.s === "up"
          ? ledger.r.ids.map((id) => <Letter key={id} id={id} />)
          : null}
      </Section>

      <Section
        title="Stamp gallery"
        hint="traveler_stamp pulls the pointer raster across the wire; found:false is an honest record, never a fabricated mark."
      >
        {ledger.s === "up" && ledger.r.ids.length > 0
          ? ledger.r.ids.slice(0, 24).map((id) => <StampCard key={id} id={id} />)
          : null}
      </Section>

      <Section
        title="Share panel"
        hint="the kit CarrierShare: you name the lane and the address; the render states what a recipient needs."
      >
        <SharePanel roster={roster.s === "up" ? roster.r : null} ids={ledger.s === "up" ? ledger.r.ids : []} />
      </Section>

      <Section
        title="Plates roster"
        hint="custom plate lanes as pure data; the write stays carrier_plate_define, door-gated (prd-web 6.1)."
      >
        {roster.s === "up" && roster.r.plates.length === 0 ? (
          <p className="text-sm text-ink-soft">no plates defined on this brain yet.</p>
        ) : null}
        {roster.s === "up"
          ? roster.r.plates.map((pl) => <LaneRow key={pl.id} lane={pl} />)
          : null}
      </Section>
    </div>
  );
}

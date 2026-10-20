import * as React from "react";

/**
 * CarrierShare — the carrier-neutral share renderer (prd-carrier-share.md
 * 3.1, extends prd-web.md 4.2). KIT LAW: this is a PURE renderer — no door
 * calls, no asserts, no fetches, no state. The CALLER names the carrier and
 * brings the artifact (via carrier_encode / traveler_stamp through the
 * door); the component renders what arrived and states how a recipient
 * decodes it. It decides nothing: lane choice is a USER pick per need,
 * fed here as props (the caps input comes from carrier_lane_list).
 *
 * Law (inherits prd-web.md 4.2 verbatim, owner-set): hash-verified
 * payloads, never capability-smuggling, honest typed refusals per lane,
 * the decode sentence ALWAYS rendered. Nothing auto-downloads, nothing
 * opens a door. The vendored copy rides the dashboard frame unchanged —
 * byte-identical + hash-pinned by scripts/vendor-relay-kit.js.
 */

export interface CarrierCaps {
  scan?: boolean;   // handheld camera can read it (qr lane)
  airgap?: boolean; // crosses an air gap as bytes-on-screen / print
  print?: boolean;  // could be physically printed and rescanned
  paste?: boolean;  // survives a chat/text paste intact
}

export interface CarrierShareProps {
  /** the lane the CALLER chose (never sniffed): qr|svg|nsc9|json|stone|<plate id> */
  lane: string;
  /** the artifact string the pod gave back (frame / text / digits) */
  artifact?: string;
  /** base64 PNG raster (qr lane — full-object or pointer mark) */
  png?: string;
  moduleCount?: number;
  /** the packet's own 64-hex content address (the hash pin) */
  address?: string;
  /** the pointer frame (VANT:1:<64hex>) when the mark is a pointer */
  pointer?: string;
  caps?: CarrierCaps;
  /** custom-plate honesty line (prefix/suffix from the roster) */
  plate?: { prefix?: string; suffix?: string };
  note?: string;
}

/** Decode sentence helper (exported so tests can pin it word-for-word). */
export function decodeSentence(lane: string): string {
  switch (lane) {
    case "qr":
      return "Recipient needs: a camera — scan the raster (vant grammar; a pointer mark resolves on the node holding the body).";
    case "svg":
      return "Recipient needs: vant carriers.decode on the svg lane (sealed stone envelope; tamper refuses typed).";
    case "nsc9":
      return "Recipient needs: the doorway digits into the NSC-9 window — the 64-hex address below is the lattice-scale identity (the barcode is the doorway, the lattice is the space).";
    case "json":
      return "Recipient needs: carriers.decode on the json lane (the fenced text, addressed as-is).";
    case "stone":
      return "Recipient needs: carriers.decode on the stone lane (the invariant frame; the seal walls re-apply).";
    default:
      return "Recipient needs: carriers.decode on this custom plate lane (the frame prefix/suffix below is the honest marker).";
  }
}

function Fenced({ text }: { text: string }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded border border-line bg-ink/5 p-2 text-xs text-ink">
      {text}
    </pre>
  );
}

function CapBadge({ label, on }: { label: string; on: boolean | undefined }) {
  return (
    <span
      className={
        "rounded-full border px-2 py-0.5 text-[11px] " +
        (on
          ? "border-moss/40 bg-moss/10 text-moss"
          : "border-line bg-surface text-ink-soft")
      }
    >
      {label}
      {on === undefined ? " (roster did not say)" : on ? "" : "-"}
    </span>
  );
}

/** The refusal: unknown lane, typed. The component never guesses. */
function Refuse({ lane }: { lane: string }) {
  return (
    <div className="rounded-lg border border-err/40 bg-err/5 p-3 text-sm">
      <p className="font-medium text-err">
        E_CARRIER_SHAPE: unknown lane {JSON.stringify(lane)}
      </p>
      <p className="mt-1 text-ink-soft">
        The caller names the carrier; the component decides nothing. Pick a
        lane from carrier_lane_list — a lane that is not on that roster is
        not on this pod, and nothing here pretends otherwise.
      </p>
    </div>
  );
}

export default function CarrierShare(p: CarrierShareProps): React.ReactElement {
  // Unknown lane → typed refusal (the spec's own pin). Lanes that exist on
  // this pod are enumerated here pending the roster passthrough; a CUSTOM
  // plate is honest too — it renders through the plate branch.
  const KNOWN = new Set(["qr", "svg", "nsc9", "json", "stone"]);
  const isPlate = !KNOWN.has(p.lane) && !!p.plate;
  if (!KNOWN.has(p.lane) && !isPlate) {
    return <Refuse lane={p.lane} />;
  }

  const addr = p.address ?? (p.pointer ? p.pointer.replace(/^VANT:1:/, "") : undefined);

  return (
    <div className="rounded-lg border border-line bg-surface p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">share — {p.lane} lane</span>
        {p.note ? <span className="text-xs text-ink-soft">{p.note}</span> : null}
      </div>

      {p.lane === "qr" && p.png ? (
        <div className="mt-2">
          <img
            src={`data:image/png;base64,${p.png}`}
            alt={`QR raster, ${p.moduleCount ?? "?"} modules`}
            width={Math.max((p.moduleCount ?? 21) * 4, 160)}
            className="rounded border border-line bg-white p-1"
          />
          {p.moduleCount ? (
            <p className="mt-1 text-xs text-ink-soft">
              {p.moduleCount} modules — the bytes we hand a recipient are the
              exact bytes shown never re-rendered.
            </p>
          ) : null}
        </div>
      ) : null}

      {p.lane === "svg" && p.artifact ? (
        <div className="mt-2">
          <img
            src={`data:image/svg+xml;base64,${btoa(p.artifact)}`}
            alt="sealed svg stone"
            width={300}
            className="rounded border border-line bg-white"
          />
          <a
            download="vant-stone.svg"
            href={`data:image/svg+xml;base64,${btoa(p.artifact)}`}
            className="mt-1 inline-block text-xs text-accent hover:underline"
          >
            download the svg stone — never auto-downloaded
          </a>
        </div>
      ) : null}

      {p.lane === "nsc9" && p.artifact ? (
        <p className="mt-2 font-mono text-lg tracking-widest text-ink">{p.artifact}</p>
      ) : null}

      {p.lane === "json" && p.artifact ? <Fenced text={p.artifact} /> : null}
      {p.lane === "stone" && p.artifact ? <Fenced text={p.artifact} /> : null}
      {p.plate ? (
        <p className="mt-2 text-xs text-ink-soft">
          custom plate honesty line: prefix{" "}
          <code className="font-mono">{p.plate.prefix ?? "(none)"}</code> suffix{" "}
          <code className="font-mono">{p.plate.suffix ?? "(none)"}</code>
        </p>
      ) : null}

      <p className="mt-3 text-xs text-ink-soft">{decodeSentence(p.lane)}</p>

      {p.caps ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <CapBadge label="camera scan" on={p.caps.scan} />
          <CapBadge label="air gap" on={p.caps.airgap} />
          <CapBadge label="print" on={p.caps.print} />
          <CapBadge label="paste" on={p.caps.paste} />
        </div>
      ) : null}

      {addr ? (
        <p className="mt-2 font-mono text-[11px] text-ink-soft">
          {p.pointer ? p.pointer : `content address: ${addr}`}
        </p>
      ) : null}
      {addr ? (
        <p className="mt-1 text-[11px] text-ink-soft">
          hash-verified: {addr} — the address derives from the packet's own
          contents; a tampered artifact refuses typed, never repairs.
        </p>
      ) : null}
    </div>
  );
}

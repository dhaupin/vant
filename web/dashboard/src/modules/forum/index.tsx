import { useMemo } from "react";
import { useEvents } from "../../frame/events";
import { Help } from "../../frame/Tooltip";

/**
 * Module: forum (catalog #9). Deliberately RENDER-ONLY from the shared
 * stream: until a live pod confirms which forum tools exist, this page
 * invents nothing - it shows exactly the forum-family events received,
 * or says that in one line.
 */
function extractText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const r = raw as Record<string, unknown>;
  return (
    (typeof r.subject === "string" && r.subject) ||
    (typeof r.title === "string" && r.title) ||
    (typeof r.body === "string" && r.body) ||
    Object.keys(r).slice(0, 4).join(" / ")
  );
}

export default function Forum() {
  const fan = useEvents();
  const events = useMemo(
    () => fan.ring.filter((e) => e.family === "forum").slice(-30).reverse(),
    [fan.ring],
  );

  return (
    <div>
      <h1 className="text-lg font-semibold">Forum</h1>
      <p className="mt-1 text-sm text-ink-soft">
        forum-family events, tenant-filtered by the door before they get
        here. Writes surface once a live pod confirms its forum tools.
      </p>
      <div className="mt-6">
        {fan.status !== "live" ? (
          <Help text="The stream is not up: no events anywhere until the bridge connects.">
            <div className="rounded-lg border border-line bg-surface p-4 text-sm">
              <p className="font-medium">Stream not connected</p>
              <p className="mt-1 text-ink-soft">The board connection is {fan.status}; forum shows nothing until it is live.</p>
            </div>
          </Help>
        ) : events.length === 0 ? (
          <p className="text-sm text-ink-soft">Stream is live; no forum events have arrived for this property yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs">
                <span className="font-mono text-accent">forum</span>{" "}
                <span className="text-ink-soft">{extractText(e.raw)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

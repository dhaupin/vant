import { useEffect, useState } from "react";
import { exec, ApiError } from "../../api";
import { Refusal } from "../../frame/Refusal";
import { NotConnected, useToolsQuery, toolsByPrefix } from "../../frame/conn";
import { useEvents } from "../../frame/events";

/**
 * Module: chat (catalog #8, P2 depth). Wired to the door's REAL msg set
 * (schemas probed live 2026-10-15):
 *   msg_send   { channel, content, from? }  -> true
 *   msg_list   { channel, limit? }          -> [{ from, content, timestamp }]
 *   msg_subscribe { channel, handler? }
 * Channel ownership rides the door's claim-once stamp (pass 214): a
 * foreign scoped channel answers the typed E_TENANT_CHANNEL refusal and
 * this console renders it verbatim — never a fake success.
 */

interface Msg {
  from?: string;
  content?: string;
  timestamp?: number;
}

const CHANNELS_KEY = "bolete-channels"; // non-sensitive: channel NAMES the user visited

function visitedChannels(): string[] {
  try {
    const raw = localStorage.getItem(CHANNELS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(arr) ? arr.filter((c): c is string => typeof c === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

function rememberChannel(c: string) {
  try {
    const set = new Set(visitedChannels());
    set.add(c);
    localStorage.setItem(CHANNELS_KEY, JSON.stringify([...set]));
  } catch { /* private mode: session-only */ }
}

export default function Chat() {
  const fan = useEvents();
  const toolsQ = useToolsQuery();
  const caps = toolsQ.isSuccess ? toolsByPrefix(toolsQ.data, "msg_") : [];

  const [channels, setChannels] = useState<string[]>(() => visitedChannels());
  const [active, setActive] = useState<string>(visitedChannels()[0] ?? "");

  const hasSet = caps.some((c) => c.name === "msg_send") && caps.some((c) => c.name === "msg_list");

  const openChannel = (c: string) => {
    rememberChannel(c);
    setChannels(visitedChannels());
    setActive(c);
  };

  return (
    <div>
      <h1 className="text-lg font-semibold">Chat</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Tenant-scoped channels over the door's live msg set. Foreign owned
        channels answer the typed refusal (E_TENANT_CHANNEL) — rendered
        verbatim, never a fake read.
      </p>

      {toolsQ.isError ? (
        (() => {
          const e = toolsQ.error as ApiError;
          return e.kind === "network"
            ? <NotConnected why="The bridge is unreachable, so channels and tails cannot load." />
            : <Refusal error={e} onRetry={() => toolsQ.refetch()} />;
        })()
      ) : null}
      {toolsQ.isSuccess && !hasSet ? (
        <NotConnected why="The door answered but does not carry the msg_send+msg_list pair; there is nothing to chat through and nothing to fake." />
      ) : null}

      {hasSet ? (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          <ChannelRail channels={channels} active={active} onOpen={openChannel} />
          <div className="min-w-0 flex-1">
            {active ? (
              <ChannelView channel={active} />
            ) : (
              <p className="text-sm text-ink-soft">
                Open a channel (or create one in the rail) to read its tail.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-ink-soft">stream events (msg family)</p>
      {fan.ring.filter((e) => e.family === "msg").length === 0 ? (
        <p className="mt-1 text-xs text-ink-soft">
          No msg events on the stream yet{fan.status === "live" ? " — the stream is live and quiet" : ""}.
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {fan.ring
            .filter((e) => e.family === "msg")
            .slice(-20)
            .reverse()
            .map((e, i) => (
              <li key={`${e.at}-${i}`} className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs">
                <span className="font-mono text-accent">msg</span>{" "}
                <span className="text-ink-soft">{e.raw && typeof e.raw === "object" ? JSON.stringify(e.raw).slice(0, 160) : String(e.raw ?? "")}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function ChannelRail({ channels, active, onOpen }: { channels: string[]; active: string; onOpen: (c: string) => void }) {
  const [draft, setDraft] = useState("");
  const go = () => {
    const clean = draft.trim().replace(/\s+/g, "-").slice(0, 40);
    if (/^[a-z0-9][a-z0-9-]*$/i.test(clean)) onOpen(clean);
    setDraft("");
  };
  return (
    <aside className="w-full shrink-0 rounded-lg border border-line bg-surface p-3 sm:w-52">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">channels</p>
      <ul className="mt-2 space-y-0.5">
        {channels.map((c) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => onOpen(c)}
              className={`w-full truncate rounded px-2 py-1 text-left text-sm ${c === active ? "bg-ink/10 font-medium" : "text-ink-soft hover:bg-ink/5"}`}
            >
              <span className="font-mono text-accent">#</span> {c}
            </button>
          </li>
        ))}
        {channels.length === 0 ? (
          <li className="px-2 text-xs text-ink-soft">no channels visited yet</li>
        ) : null}
      </ul>
      <div className="mt-3 flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
          placeholder="new-or-visit"
          spellCheck={false}
          className="w-full rounded border border-line bg-paper px-2 py-1 font-mono text-xs outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={go}
          className="shrink-0 rounded bg-accent px-2 py-1 text-xs text-paper hover:bg-accent-deep"
        >
          Go
        </button>
      </div>
    </aside>
  );
}

function ChannelView({ channel }: { channel: string }) {
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "refused" | "empty">("loading");
  const [refusal, setRefusal] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setState("loading");
    try {
      const r = (await exec("msg_list", { channel, limit: 50 })) as unknown;
      const arr = Array.isArray(r) ? r as Msg[] : [];
      setMsgs(arr);
      setState(arr.length === 0 ? "empty" : "ok");
    } catch (err) {
      if (err instanceof ApiError) {
        setRefusal(err.message);
      } else {
        setRefusal("the door did not answer");
      }
      setState("refused");
    }
  };

  useEffect(() => { void load(); }, [channel]);

  const send = async () => {
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    try {
      await exec("msg_send", { channel, content, from: "dash-guest" });
      setDraft("");
      await load();
    } catch (err) {
      setRefusal(err instanceof ApiError ? err.message : "the send did not reach the door");
      setState("refused");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <h2 className="font-mono text-sm font-medium"><span className="text-accent">#</span> {channel}</h2>
      <button type="button" onClick={load} className="mt-1 text-xs text-ink-soft underline hover:text-ink">
        refresh tail
      </button>

      {state === "refused" ? (
        <p className="mt-3 rounded-md border border-err/40 bg-err/5 px-3 py-2 text-xs text-err">
          {refusal}
        </p>
      ) : null}
      {state === "empty" ? (
        <p className="mt-3 text-xs text-ink-soft">No messages yet — the tail is honestly empty.</p>
      ) : null}
      {state === "ok" && msgs ? (
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {msgs.slice().reverse().map((m, i) => (
            <li key={m.timestamp ?? i} className="rounded border border-line bg-paper px-3 py-1.5 text-sm">
              <span className="font-medium text-accent">{m.from ?? "?"}</span>{" "}
              <span>{m.content ?? ""}</span>
              <span className="ml-2 text-[10px] text-ink-soft">
                {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
          placeholder={`say something in #${channel}…`}
          className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={send}
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm text-paper hover:bg-accent-deep disabled:opacity-50"
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

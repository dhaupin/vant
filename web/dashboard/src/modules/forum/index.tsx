import { useEffect, useState } from "react";
import { exec, ApiError } from "../../api";
import { useToolsQuery, toolsByPrefix } from "../../frame/conn";

interface StatusShape {
  publications?: number;
  listeners?: number;
  inSpace?: boolean;
  forumId?: string | null;
  [k: string]: unknown;
}

export default function Forum() {
  const toolsQ = useToolsQuery();
  const caps = toolsQ.isSuccess ? toolsByPrefix(toolsQ.data, "forum_") : [];
  const hasPublish = caps.some((c) => c.name === "forum_publish");

  return (
    <div>
      <h1 className="text-lg font-semibold">Forum</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Publications and decisions over the door's live forum set; writes
        carry the door's own verdicts back verbatim.
      </p>
      {toolsQ.isError ? null : null}
      {hasPublish ? <PublishPanel /> : null}
      {caps.some((c) => c.name === "forum_status") ? <StatusCard /> : null}
    </div>
  );
}

function PublishPanel() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const publish = async () => {
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true);
    setOut(null);
    const args: Record<string, unknown> = { title: title.trim(), content: content.trim() };
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length) args.tags = tagList;
    try {
      const r = (await exec("forum_publish", args)) as { published?: boolean; publication?: { id?: string }; error?: string };
      if (r.published && r.publication?.id) {
        setOut({ text: `published — ${r.publication.id}`, bad: false });
        setTitle("");
        setContent("");
        setTags("");
      } else {
        setOut({ text: r.error ? `refused — ${r.error}` : "the door did not confirm the publish", bad: true });
      }
    } catch (err) {
      setOut({ text: err instanceof ApiError ? err.message : "the publish did not reach the door", bad: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Publish</h2>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="mt-3 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-sm outline-none focus:border-accent"
      />
      <textarea
        rows={3}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Body…"
        className="mt-2 w-full rounded-md border border-line bg-paper p-2 text-sm outline-none focus:border-accent"
      />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="tags, comma-separated (optional)"
        className="mt-2 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-xs outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={publish}
        disabled={busy || !title.trim() || !content.trim()}
        className="mt-3 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-paper hover:bg-accent-deep disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Publishing…" : "Publish"}
      </button>
      {out ? (
        <p className={`mt-2 rounded-md border px-3 py-2 font-mono text-xs ${out.bad ? "border-err/40 text-err" : "border-line"}`}>
          {out.text}
        </p>
      ) : null}
    </div>
  );
}

function StatusCard() {
  const [status, setStatus] = useState<StatusShape | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    exec("forum_status", {})
      .then((r) => { if (alive) setStatus((r ?? {}) as StatusShape); })
      .catch((e) => { if (alive) setErr(e instanceof ApiError ? e.message : "status unreadable"); });
    return () => { alive = false; };
  }, []);

  if (err) return <p className="mt-4 text-xs text-ink-soft">forum_status: {err}</p>;
  if (!status) return null;
  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="publications" value={status.publications} />
      <Stat label="listeners" value={status.listeners} />
      <Stat label="in space" value={status.inSpace ? "yes" : "no"} />
      <Stat label="forum id" value={status.forumId ?? "—"} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
      <p className="mt-1 text-sm font-medium flex items-center gap-1">
        {value === undefined ? "—" : String(value)}
      </p>
    </div>
  );
}

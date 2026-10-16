import { useState } from "react";
import { exec, ApiError } from "../api";

/**
 * The ONE tool-call panel (owner directive: no fakery, one shared
 * mechanism). Renders a real door-registered tool, calls exactly what
 * is typed, and shows the REAL pod result or the typed refusal - never
 * sample output.
 */
export function ToolCall({ name, description }: { name: string; description?: string }) {
  const [args, setArgs] = useState("{}");
  const [out, setOut] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async () => {
    setBusy(true);
    try {
      const result = await exec(name, JSON.parse(args || "{}") as Record<string, unknown>);
      setOut({ text: JSON.stringify(result, null, 2), bad: false });
    } catch (err) {
      setOut({
        text: err instanceof SyntaxError
          ? "not valid JSON - this panel calls exactly what you type"
          : err instanceof ApiError
            ? err.message
            : String(err),
        bad: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
      <summary className="cursor-pointer font-mono text-xs font-medium">{name}</summary>
      {description ? <p className="mt-1 text-xs text-ink-soft">{description}</p> : null}
      <textarea
        rows={3}
        value={args}
        onChange={(e) => setArgs(e.target.value)}
        spellCheck={false}
        className="mt-2 w-full rounded border border-line bg-paper p-2 font-mono text-xs"
      />
      <button
        onClick={call}
        disabled={busy}
        className="mt-2 rounded bg-accent px-2.5 py-1 text-xs text-paper hover:bg-accent-deep disabled:opacity-50"
      >
        {busy ? "Calling..." : "Call"}
      </button>
      {out ? (
        <pre
          className={`mt-2 overflow-auto rounded border p-3 font-mono text-xs ${out.bad ? "border-err/40" : "border-line"}`}
        >
          {out.text}
        </pre>
      ) : null}
    </details>
  );
}

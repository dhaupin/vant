import { useEffect, useState } from "react";
import { exec, ApiError } from "../../api";

/**
 * The work_assign form (P2, prd-web.md 4 module #7): bound to the door's
 * REAL schema (probed live 2026-10-15: task required; agentId = reuse an
 * existing agent; name/role = spawn a fresh one when no id is given;
 * budget = optional escrow hold released on refusal). Refusals surface
 * TYPED (E_SPAWN_REFUSED etc.) — the P2 acceptance names this exact case.
 */

interface Out {
  text: string;
  bad: boolean;
}

export function AssignForm() {
  const [task, setTask] = useState("");
  const [agentId, setAgentId] = useState("");
  const [spawnName, setSpawnName] = useState("");
  const [budget, setBudget] = useState("");
  const [out, setOut] = useState<Out | null>(null);
  const [busy, setBusy] = useState(false);
  const [roster, setRoster] = useState<Array<{ id: string; name?: string }>>([]);
  const [rosterNote, setRosterNote] = useState<string | null>(null);

  // The reuse-by-id picker feeds from the door's REAL roster (agent_list),
  // never an invented list.
  useEffect(() => {
    let alive = true;
    exec("agent_list", {})
      .then((r) => {
        if (!alive) return;
        const agents = (r as { agents?: unknown }).agents;
        setRoster(
          Array.isArray(agents)
            ? agents.filter((a) => a && typeof a === "object" && typeof (a as { id?: unknown }).id === "string") as Array<{ id: string; name?: string }>
            : [],
        );
      })
      .catch(() => setRosterNote("roster unreadable — agent id can be typed by hand"));
    return () => { alive = false; };
  }, []);

  const assign = async () => {
    setBusy(true);
    setOut(null);
    const args: Record<string, unknown> = {};
    if (task.trim()) args.task = task.trim();
    if (agentId.trim()) args.agentId = agentId.trim();
    if (!agentId.trim() && spawnName.trim()) args.name = spawnName.trim();
    if (budget.trim() && Number.isFinite(Number(budget.trim()))) args.budget = Number(budget.trim());
    try {
      const r = await exec("work_assign", args);
      const okShape = (r as { ok?: boolean }).ok;
      const code = (r as { code?: string }).code;
      const errText = (r as { error?: string }).error;
      setOut({
        bad: okShape === false,
        text: okShape === false
          ? `refused — ${code ?? "typed"}: ${errText ?? "the door said no"}`
          : JSON.stringify(r, null, 2),
      });
    } catch (err) {
      setOut({
        bad: true,
        text: err instanceof ApiError ? err.message : "the call did not reach the door",
      });
    } finally {
      setBusy(false);
    }
  };

  const canSend = task.trim().length > 0 && !busy;

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Issue work</h2>
      <p className="mt-1 text-xs text-ink-soft">
        One call = the full handoff: task + optional escrow budget + spawn
        or reuse. Every refusal comes back TYPED from the door (e.g. a
        guest without spawn capability answers E_SPAWN_REFUSED — that is
        the sandbox's honest gate, rendered verbatim).
      </p>
      <textarea
        rows={3}
        value={task}
        onChange={(e) => setTask(e.target.value)}
        placeholder="The task text the agent will wake to…"
        className="mt-3 w-full rounded-md border border-line bg-paper p-2 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-ink-soft">reuse agent (id)</span>
          <input
            list="work-roster"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="leave empty to spawn"
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
          />
          <datalist id="work-roster">
            {roster.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ? `${a.name} (${a.id})` : a.id}
              </option>
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-xs text-ink-soft">spawn name (when no id)</span>
          <input
            value={spawnName}
            onChange={(e) => setSpawnName(e.target.value)}
            placeholder="crew name for the fresh agent"
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="text-xs text-ink-soft">escrow budget (optional)</span>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="e.g. 100 — units gated as a hold"
            spellCheck={false}
            inputMode="numeric"
            className="mt-1 w-full rounded-md border border-line bg-paper px-2 py-1.5 text-xs outline-none focus:border-accent"
          />
        </label>
      </div>
      {rosterNote ? <p className="mt-2 text-xs text-ink-soft">{rosterNote}</p> : null}
      <button
        type="button"
        onClick={assign}
        disabled={!canSend}
        className="mt-3 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-paper hover:bg-accent-deep disabled:opacity-50 sm:w-auto"
      >
        {busy ? "Assigning…" : "Assign work"}
      </button>
      {out ? (
        <pre
          className={`mt-3 overflow-auto rounded border p-3 font-mono text-xs whitespace-pre-wrap ${
            out.bad ? "border-err/40 text-err" : "border-line"
          }`}
        >
          {out.text}
        </pre>
      ) : null}
    </div>
  );
}

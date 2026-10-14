import { actions, useAppRaw } from "../../state";
import { Help } from "../../frame/Tooltip";
import { ConfirmationModal } from "./confirm";

/**
 * Module: settings (catalog #4). Theme (both modes, system), the help
 * layer toggle, session controls, and the property-attach notes (3.4).
 * All frame-owned conventions; this module only surfaces them.
 */
export default function Settings() {
  const app = useAppRaw();

  return (
    <div>
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Everything here is frame-level; modules never ship their own
        settings plumbing.
      </p>

      <Section title="Theme">
        <Help text="Light and dark ship from day one (prd-web.md 2.6); tokens are CSS vars so the brand carries across both.">
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => actions.setTheme(t)}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  app.theme === t ? "border-accent bg-accent/10 font-medium" : "border-line hover:bg-ink/5"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Help>
      </Section>

      <Section title="Help layer">
        <Help text="Tooltips on confusing controls, inputs, and surfaces. Off removes the ? markers without changing behavior.">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={app.help}
              onChange={(e) => actions.toggleHelp(e.target.checked)}
            />
            show help markers everywhere
          </label>
        </Help>
      </Section>

      <Section title="Session & properties">
        <p className="text-sm text-ink-soft">
          Property <span className="font-mono text-ink">{app.property}</span>;
          attach more via the Pages env registry
          (<span className="font-mono">VANT_PROPERTY_&lt;ID&gt;_* in Pages settings, prd-web.md 3.4</span>).
        </p>
        <ConfirmationModal />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-lg border border-line bg-surface p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-soft">{title}</p>
      {children}
    </div>
  );
}

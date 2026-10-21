import { Suspense, useEffect, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Menu as MenuIcon } from "lucide-react";
import { MODULES, SECTIONS } from "./registry";
import { Footer } from "./Footer";
import { ErrorBoundary } from "./ErrorBoundary";
import { PanelSkeleton } from "./ui";
import { AuthGate } from "./AuthGate";
import { useRouter } from "@tanstack/react-router";
import { actions, useApp } from "../state";
import { Help } from "./Tooltip";
import { setDesiredProperty } from "./events";
import { usePropertyList } from "./Properties";

/**
 * The frame (prd-web.md 3.3): nav + routes render FROM the module
 * registry; property switching rides ?p= (3.4); footer + help layer +
 * loading system + error boundary are frame-owned (10). Modules never
 * edit this file - a new module lands in the registry.
 */

export function Frame({ children }: { children?: React.ReactNode }) {
  const theme = useApp((s) => s.theme);
  const property = useApp((s) => s.property);
  // The module menu: open by default on desktop, collapsed on phones
  // (viewport economy — CF-dashboard pattern). The burger toggles BOTH
  // sizes: on <sm it opens a left drawer, on ≥sm it collapses/shows
  // the static sidebar.
  const [navOpen, setNavOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 640 : true,
  );

  // theme token application: .dark on <html> (prd-web.md 2.6: tokens via class)
  useEffect(() => {
    const dark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, [theme]);

  return (
    <AuthGate>
      <PropertySync />
      <div className="flex min-h-screen flex-col">
        <TopBar property={property} navOpen={navOpen} onToggleNav={() => setNavOpen((v) => !v)} />
        {/* the frame owns the one SSE connection: property change -> reconnect (3.4) */}
        <BoardConnection property={property} />
        <div className="mx-auto flex w-full max-w-5xl flex-1 gap-6 px-4 py-4">
          <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
          <main id="main" className="min-w-0 flex-1">
            <ErrorBoundary>
              <Suspense fallback={<PanelSkeleton />}>
                {children}
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>
        <Footer />
      </div>
    </AuthGate>
  );
}

/** The active property rides the URL (?p=) so route + view persist (3.4). */
function PropertySync() {
  const location = useLocation();
  useEffect(() => {
    actions.switchPropertyFromUrl();
  }, [location.pathname]);
  return null;
}

/** The frame-owned board connection: ONE EventSource per active property
 *  (prd-web.md 3.3 resp. 3). Connects when a pasted token exists OR a
 *  live account session has the pod token bound server-side (P2; the
 *  HttpOnly cookie carries auth). */
function BoardConnection({ property }: { property: string }) {
  const token = useApp((s) => s.tokens[s.property] ?? null);
  const account = useApp((s) => s.account);
  const bound = useApp((s) => s.boundFor.includes(s.property));
  const open = !!token || (!!account && bound);
  useEffect(() => {
    if (open) setDesiredProperty(property);
  }, [property, open]);
  return null;
}

function TopBar({ property, navOpen, onToggleNav }: { property: string; navOpen: boolean; onToggleNav: () => void }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-label={navOpen ? "Hide module menu" : "Show module menu"}
          aria-expanded={navOpen}
          onClick={onToggleNav}
          className="shrink-0 rounded-md border border-line p-1.5 text-ink-soft hover:bg-ink/5"
        >
          <MenuIcon size={16} />
        </button>
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img
            alt=""
            className="size-6"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='13' r='10' fill='%23a9701e'/%3E%3Crect x='12' y='22' width='8' height='8' rx='3' fill='%23b89a5a'/%3E%3C/svg%3E"
          />
          Bolete
        </Link>
        <PropertySwitcher active={property} />
      </div>
    </header>
  );
}

function PropertySwitcher({ active }: { active: string }) {
  const list = usePropertyList();
  const router = useRouter();
  const choose = (id: string) => {
    if (id === active) return;
    // route + scroll persist; everything data-side re-keys (prd-web.md 3.4).
    // The switch goes through the router's OWN history adapter: the typed
    // search reducer rejects literal objects for an all-optional search
    // schema (v1 quirk), and replace() keeps the router fully in sync.
    router.history.replace(`${router.history.location.pathname}?p=${encodeURIComponent(id)}`);
  };
  if (list.length === 0) {
    return (
      <Help text="Each attached Vant install is a property. This deployment's registry is empty or the bridge cannot list it yet - add VANT_PROPERTY_<ID>_ORIGIN vars in Pages settings. Switching keeps your route and view.">
        <span className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft">
          property: <span className="font-mono text-ink">{active}</span>
        </span>
      </Help>
    );
  }
  return (
    <Help
      text={
        list.length === 1
          ? `One attached install (property ${list[0].id}). More attach by adding VANT_PROPERTY_<ID>_ORIGIN pairs in Pages settings; they appear here without a redeploy of app code.`
          : `${list.length} attached installs. Switching keeps your route, module, and filters; the stream reconnects to the chosen pod only.`
      }
    >
      <select
        aria-label="Active property"
        value={active}
        onChange={(e) => choose(e.target.value)}
        className={`rounded-md border px-2 h-7 text-xs outline-none ${
          list.some((p) => p.id === active)
            ? "border-line bg-surface text-ink"
            : "border-err/50 bg-err/5 text-err" // honest: URL rides an id the bridge does not serve
        }`}
      >
        {!list.some((p) => p.id === active) ? (
          <option value={active}>{active} (not registered)</option>
        ) : null}
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.id === p.name ? p.id : `${p.name} (${p.id})`}
          </option>
        ))}
      </select>
    </Help>
  );
}

function SideNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();
  // ONE nav truth (registry), two presentations:
  //   ≥sm: static column, burger toggles it open/closed (CF-dashboard)
  //   <sm: left drawer overlay, burger opens, backdrop click closes
  const nav = (
    <nav aria-label="Modules" className="w-44 shrink-0 space-y-4 pt-1">
      {SECTIONS.map((section) => {
        const items = MODULES.filter((m) => m.section === section);
        if (items.length === 0) return null;
        return (
          <div key={section}>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              {section}
            </p>
            <ul className="space-y-0.5">
              {items.map((m) => {
                const active =
                  m.route === "/" ? location.pathname === "/" : location.pathname.startsWith(m.route);
                const Icon = m.icon;
                return (
                  <li key={m.id}>
                    <Link
                      to={m.route}
                      onClick={onClose}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink/5 ${
                        active ? "bg-ink/10 font-medium" : "text-ink-soft"
                      }`}
                    >
                      <Icon size={15} />
                      {m.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {/* Frame-owned crosslinks (passes 296/313): one of three crosslinked
          sites - the Brain dashboard is THIS surface; out-links ride
          target=_blank so a click never nukes an in-flight session. */}
      <div>
        <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
          Sites
        </p>
        <ul className="space-y-0.5">
          <li>
            <a
              href="https://vant.creadev.org"
              rel="noopener"
              target="_blank"
              onClick={onClose}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-ink/5"
            >
              Lander
            </a>
          </li>
          <li>
            <a
              href="https://docs.creadev.org/vant"
              rel="noopener"
              target="_blank"
              onClick={onClose}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-ink/5"
            >
              Docs
            </a>
          </li>
          <li>
            <a
              href="https://github.com/dhaupin/vant/issues"
              rel="noopener"
              target="_blank"
              onClick={onClose}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-soft hover:bg-ink/5"
            >
              Contact
            </a>
          </li>
        </ul>
      </div>
    </nav>
  );
  return (
    <>
      {/* ≥sm static column */}
      <div className={open ? "hidden sm:block" : "hidden"}>{nav}</div>
      {/* <sm drawer: overlay + panel; onClose kills state so a resize to
          desktop never leaves a phantom-open drawer state */}
      <div
        className={`sm:hidden fixed inset-0 z-40 ${open ? "" : "hidden"}`}
        role="dialog"
        aria-modal="true"
      >
        <button
          type="button"
          aria-label="Close module menu"
          onClick={onClose}
          className="absolute inset-0 bg-ink/30"
        />
        <div className="absolute inset-y-0 left-0 w-60 max-w-[80vw] overflow-y-auto border-r border-line bg-surface p-4 shadow-xl">
          {nav}
        </div>
      </div>
    </>
  );
}

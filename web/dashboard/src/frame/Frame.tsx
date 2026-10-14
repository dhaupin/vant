import { Suspense, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { MODULES, SECTIONS } from "./registry";
import { Footer } from "./Footer";
import { ErrorBoundary } from "./ErrorBoundary";
import { PanelSkeleton } from "./ui";
import { AuthGate } from "./AuthGate";
import { actions, useApp } from "../state";
import { Help } from "./Tooltip";

/**
 * The frame (prd-web.md 3.3): nav + routes render FROM the module
 * registry; property switching rides ?p= (3.4); footer + help layer +
 * loading system + error boundary are frame-owned (10). Modules never
 * edit this file - a new module lands in the registry.
 */

export function Frame({ children }: { children?: React.ReactNode }) {
  const theme = useApp((s) => s.theme);
  const property = useApp((s) => s.property);

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
        <TopBar property={property} />
        <div className="mx-auto flex w-full max-w-5xl flex-1 gap-6 px-4 py-4">
          <SideNav />
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

function TopBar({ property }: { property: string }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <img
            alt=""
            className="size-6"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='13' r='10' fill='%23a9701e'/%3E%3Crect x='12' y='22' width='8' height='8' rx='3' fill='%23b89a5a'/%3E%3C/svg%3E"
          />
          Bolete
        </Link>
        <PropertySwitcher active={property} />
        <span className="ml-auto" />
        <HelpToggle />
      </div>
    </header>
  );
}

function PropertySwitcher({ active }: { active: string }) {
  return (
    <Help text="Each attached Vant install is a property. Switching keeps your route and filters (prd-web.md 3.4). The env-registry attach UI grows here.">
      <span className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft">
        property: <span className="font-mono text-ink">{active}</span>
      </span>
    </Help>
  );
}

function HelpToggle() {
  const help = useApp((s) => s.help);
  return (
    <button
      onClick={() => actions.toggleHelp(!help)}
      className="rounded-md border border-line px-2 py-1 text-xs text-ink-soft hover:bg-ink/5"
    >
      {help ? "Hide help" : "Show help"}
    </button>
  );
}

function SideNav() {
  const location = useLocation();
  return (
    <nav aria-label="Modules" className="hidden w-44 shrink-0 space-y-4 pt-1 sm:block">
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
                    <Help text={m.blurb}>
                      <Link
                        to={m.route}
                        className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-ink/5 ${
                          active ? "bg-ink/10 font-medium" : "text-ink-soft"
                        }`}
                      >
                        <Icon size={15} />
                        {m.title}
                      </Link>
                    </Help>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

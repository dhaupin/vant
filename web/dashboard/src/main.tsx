import { StrictMode, lazy, Suspense, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles/index.css";
import { MODULES } from "./frame/registry";
import { Frame } from "./frame/Frame";
import { PanelSkeleton } from "./frame/ui";

// Frame-owned error pages (prd-web.md 3.3 rule 8 + section 10)
const NotFound = lazy(() => import("./pages/NotFound"));
const AppError = lazy(() => import("./pages/AppError"));

const rootRoute = createRootRoute({
  // The multi-install property rides ?p= (prd-web.md 3.4). Declaring it
  // here makes it a typed search param: TS guards every switch, the
  // router preserves it across navigations, and hostile values fail the
  // charset gate instead of reaching the bridge.
  validateSearch: (search: Record<string, unknown>): { p?: string } => ({
    p:
      typeof search.p === "string" && /^[a-z0-9-]{1,40}$/.test(search.p)
        ? search.p
        : undefined,
  }),
  component: () => (
    <QueryClientProvider client={queryClient}>
      <FrameWithOutlet />
    </QueryClientProvider>
  ),
  notFoundComponent: NotFound,
  errorComponent: () => (
    <Suspense fallback={<PanelSkeleton />}>
      <AppError />
    </Suspense>
  ),
});

function FrameWithOutlet() {
  return (
    <Frame>
      <Outlet />
    </Frame>
  );
}

// Legal pages: frame-routed, frame-owned (module 6 in the catalog)
const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: lazy(() => import("./pages/Terms")),
  notFoundComponent: NotFound,
});
const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: lazy(() => import("./pages/Privacy")),
  notFoundComponent: NotFound,
});

// Module routes render FROM the registry - new module = new folder (3.3)
/** Registry-driven route: one entry, one route, literal path preserved. */
function routeFor<M extends (typeof MODULES)[number]>(entry: M) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: entry.route,
    component: lazy(async () => {
      const mod = await entry.load();
      return { default: mod.default as ComponentType };
    }),
    notFoundComponent: NotFound,
  });
}

const moduleRoutes = [
  routeFor(MODULES[0]),
  routeFor(MODULES[1]),
  routeFor(MODULES[2]),
  routeFor(MODULES[3]),
  routeFor(MODULES[4]),
  routeFor(MODULES[5]),
  routeFor(MODULES[6]),
  routeFor(MODULES[7]),
  routeFor(MODULES[8]),
  routeFor(MODULES[9]),
  routeFor(MODULES[10]),
  routeFor(MODULES[11]),
  routeFor(MODULES[12]),
  routeFor(MODULES[13]),
  routeFor(MODULES[14]),
  routeFor(MODULES[15]),
  routeFor(MODULES[16]),
  routeFor(MODULES[17]),
];

const routeTree = rootRoute.addChildren([termsRoute, privacyRoute, ...moduleRoutes]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, refetchOnWindowFocus: false },
  },
});

const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

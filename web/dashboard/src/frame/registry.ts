import type { ComponentType } from "react";
import {
  Activity,
  Brain,
  Briefcase,
  FileClock,
  ListChecks,
  Waypoints,
  Cpu,
  Gauge,
  KeyRound,
  MessagesSquare,
  Network,
  QrCode,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  Package,
  UserCog,
  UsersRound,
  Wallet,
  Map,
} from "lucide-react";
import type { Tier } from "../state";

/**
 * The module registry (prd-web.md 3.3): every module is a self-contained
 * folder with a typed manifest. The frame renders nav + routes FROM this
 * list; adding a module means adding a folder, never editing the frame.
 * `tiers` gate MENU PRESENTATION only - the door still gates the data.
 */
export interface ModuleManifest {
  id: string;
  title: string;
  blurb: string;
  route: string;
  tiers: Tier[];
  section: "observe" | "work" | "ops";
  /** SSE event families the module consumes (the frame fans them out) */
  families: string[];
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>; // loaded lazily; the frame code-splits each
  load: () => Promise<{ default: ComponentType }>;
}

export const SECTIONS = ["observe", "work", "ops"] as const;
export type Section = (typeof SECTIONS)[number];

// `as const satisfies` keeps each `route` a LITERAL at the type level,
// and keeps every ENTRY its own distinct type - which is exactly what
// TanStack's typed Link/Router inference needs to know the paths.
export const MODULES = [
  {
    id: "live-board",
    title: "Live board",
    blurb: "The pod's event families, streamed live.",
    route: "/",
    tiers: ["O", "H", "A", "S"],
    section: "observe",
    families: ["era", "agent", "task", "escrow", "market", "forum", "msg"], // door SSE tap ROOTS (see frame/events.ts familyOf)
    icon: Activity,
    load: () => import("../modules/live-board"),
  },
  {
    id: "agents",
    title: "Agents",
    blurb: "Rosters, capability, last-seen.",
    route: "/agents",
    tiers: ["O", "H", "A", "S"],
    section: "observe",
    families: ["agent", "task"], // door SSE tap ROOTS (see frame/events.ts familyOf)
    icon: Cpu,
    load: () => import("../modules/agents"),
  },
  {
    id: "status",
    title: "Status",
    blurb: "Healths: frontend, endpoint, pods.",
    route: "/status",
    tiers: ["O", "H", "A", "S"],
    section: "ops",
    families: [],
    icon: Gauge,
    load: () => import("../modules/status"),
  },
  {
    id: "settings",
    title: "Settings",
    blurb: "Theme, help layer, identity, properties.",
    route: "/settings",
    tiers: ["O", "H", "A", "S"],
    section: "ops",
    families: [],
    icon: Settings,
    load: () => import("../modules/settings"),
  },
  {
    id: "work",
    title: "Work",
    blurb: "Assign work to the crew; typed refusals surfaced.",
    route: "/work",
    tiers: ["H", "S"],
    section: "work",
    families: ["task"], // door SSE tap ROOT: task:assigned folds under "task" (see frame/events.ts familyOf)
    icon: Briefcase,
    load: () => import("../modules/work"),
  },
  {
    id: "chat",
    title: "Chat",
    blurb: "msg channels + agent sessions.",
    route: "/chat",
    tiers: ["H", "S"],
    section: "work",
    families: ["msg"],
    icon: MessagesSquare,
    load: () => import("../modules/chat"),
  },
  {
    id: "forum",
    title: "Forum",
    blurb: "forum-family events, tenant-filtered by the door.",
    route: "/forum",
    tiers: ["O", "H", "A", "S"],
    section: "observe",
    families: ["forum"],
    icon: UsersRound,
    load: () => import("../modules/forum"),
  },
  {
    id: "market",
    title: "Market",
    blurb: "market-family events + market_ tool calls.",
    route: "/market",
    tiers: ["O", "H", "S"],
    section: "observe",
    families: ["market"],
    icon: ShoppingBag,
    load: () => import("../modules/market"),
  },
  {
    id: "brains",
    title: "Brains",
    blurb: "Corpus browser, real search, NSC9-style addressing tools.",
    route: "/brain",
    tiers: ["O", "A", "S"],
    section: "observe",
    families: [],
    icon: Brain,
    load: () => import("../modules/brains"),
  },
  {
    id: "guests",
    title: "Guests",
    blurb: "Guest lifecycle against the door's real tools.",
    route: "/guests",
    tiers: ["S"],
    section: "ops",
    families: [],
    icon: KeyRound,
    load: () => import("../modules/guests"),
  },
  {
    id: "users",
    title: "Users",
    blurb: "Dashboard accounts admin (email-OTP backed; admin-only).",
    route: "/users",
    tiers: ["S"],
    section: "ops",
    families: [],
    icon: UserCog,
    load: () => import("../modules/users"),
  },
  {
    id: "pairing",
    title: "Pairing",
    blurb: "Voucher flow; QR redeem view lands at P3.",
    route: "/pairing",
    tiers: ["S"],
    section: "ops",
    families: [],
    icon: QrCode,
    load: () => import("../modules/pairing"),
  },
  {
    id: "budgets",
    title: "Budgets",
    blurb: "Escrow/budget views through real door tools.",
    route: "/budgets",
    tiers: ["S"],
    section: "ops",
    families: [],
    icon: Wallet,
    load: () => import("../modules/budgets"),
  },
  {
    id: "config",
    title: "Config",
    blurb: "Config surfaces the door actually registers.",
    route: "/config",
    tiers: ["S"],
    section: "ops",
    families: [],
    icon: SlidersHorizontal,
    load: () => import("../modules/config"),
  },
  {
    id: "audit",
    title: "Audit",
    blurb: "This app's own ledger inbox + edge breakers.",
    route: "/audit",
    tiers: ["S"],
    section: "ops",
    families: [],
    icon: FileClock,
    load: () => import("../modules/audit"),
  },
  {
    // (vant issue #264) the combined STRUCT families page: packstruct +
    // crashtest + eyestruct + poststruct. Skeleton epoch (mock feeds,
    // kit contract vendored + pinned); observe section since it is a
    // read-only facts board.
    id: "struct-audit",
    title: "Struct audit",
    blurb: "Packstruct + crashtest + eyestruct + poststruct findings.",
    route: "/struct-audit",
    tiers: ["O", "H", "A", "S"],
    section: "observe",
    families: [],
    icon: ListChecks,
    load: () => import("../modules/struct-audit"),
  },
  {
    id: "nodes",
    title: "Nodes",
    blurb: "Node/mesh surfaces the door registers.",
    route: "/nodes",
    tiers: ["O", "A", "S"],
    section: "observe",
    families: [],
    icon: Waypoints,
    load: () => import("../modules/nodes"),
  },
  {
    // (prd-carrier-share.md 3.2 P5a) the carriers module: lane roster,
    // letter ledger, stamp gallery, share panel, plates roster. Every
    // surface renders what the door really answers; the share panel's
    // lane choice is a USER pick per need — the component decides nothing.
    id: "carriers",
    title: "Carriers",
    blurb: "Carrier lanes: ledger, stamps, share, plates.",
    route: "/carriers",
    tiers: ["O", "A", "S"],
    section: "ops",
    families: [],
    icon: Package,
    load: () => import("../modules/carriers"),
  },
  {
    // (prd-carrier-share.md 3.2 P5b) the chain module: the per-property
    // ordered hop list, the ACTIVE hop named, honest core-rung badges,
    // and a door-ridden probe (relay.lost). The two-sided contract 6.1
    // holds: this page is the READ — the editor stays in Settings.
    id: "chain",
    title: "Chain",
    blurb: "The relay chain read: hops, active hop, probe verdicts.",
    route: "/chain",
    tiers: ["O", "H", "A", "S"],
    section: "observe",
    families: [],
    icon: Network,
    load: () => import("../modules/chain"),
  },
  {
    // (the traveler carrier, tr/1; pass 254/256 frontend lane) the
    // enterprise router object's front end: mint + send through the bridge
    // lane (relay.travel), read the pin ledger through the door's real
    // traveler_* verbs, verbatim.
    id: "traveler",
    title: "Traveler",
    blurb: "Mint a traveler (content-addressed tr/1) and emit it as a pin; read the ledger.",
    route: "/traveler",
    tiers: ["O", "A", "S"],
    section: "work",
    families: [],
    icon: Map,
    load: () => import("../modules/traveler"),
  },
] as const satisfies readonly ModuleManifest[];

/** Route fallback comes from the registry too - the 404 page is frame-owned. */
export const REGISTRY_VERSION = 1;

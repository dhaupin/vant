import type { ComponentType } from "react";
import {
  Activity,
  Brain,
  Briefcase,
  FileClock,
  Waypoints,
  Cpu,
  Gauge,
  KeyRound,
  MessagesSquare,
  QrCode,
  Settings,
  ShoppingBag,
  SlidersHorizontal,
  UserCog,
  UsersRound,
  Wallet,
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
    families: ["era", "agents", "tasks", "escrow", "market", "forum", "msg"],
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
    families: ["agents", "tasks"],
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
    families: ["tasks"],
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
    blurb: "Dashboard accounts - arrive with P2 email-OTP.",
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
] as const satisfies readonly ModuleManifest[];

/** Route fallback comes from the registry too - the 404 page is frame-owned. */
export const REGISTRY_VERSION = 1;

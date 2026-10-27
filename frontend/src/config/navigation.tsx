import {
  LayoutDashboard,
  Activity,
  Share2,
  ClipboardList,
  Truck,
  UserRound,
  Building2,
  Fuel,
  Cpu,
  MapPinned,
  Router,
  ListTree,
  AlertTriangle,
  BarChart3,
  ScrollText,
  HeartPulse,
  Settings,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  phase: number
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Executive Overview", path: "/", icon: LayoutDashboard, phase: 1, description: "Enterprise-wide KPIs, charts and insights" },
  { label: "Live Operations", path: "/live-operations", icon: Activity, phase: 3, description: "Real-time view of active loading and deliveries" },
  { label: "Interactive Data Flow", path: "/data-flow", icon: Share2, phase: 4, description: "Animated, clickable system architecture diagram" },
  { label: "Orders & Authorizations", path: "/orders", icon: ClipboardList, phase: 2, description: "Order lifecycle and authorization workflow" },
  { label: "Tanker Fleet", path: "/fleet", icon: Truck, phase: 2, description: "Tanker roster, telemetry and route history" },
  { label: "Drivers", path: "/drivers", icon: UserRound, phase: 2, description: "Driver roster and duty status" },
  { label: "Stations & Terminals", path: "/stations", icon: Building2, phase: 2, description: "Station directory and bay-level detail" },
  { label: "TFS Simulator", path: "/tfs-simulator", icon: Fuel, phase: 3, description: "Interactive terminal filling system control" },
  { label: "PLC & Meter Simulator", path: "/plc-meter", icon: Cpu, phase: 3, description: "Simulated industrial equipment diagnostics" },
  { label: "GPS & Geofencing", path: "/gps", icon: MapPinned, phase: 3, description: "Fleet tracking, routes and geofence events" },
  { label: "Edge Gateway & Offline Mode", path: "/edge-gateway", icon: Router, phase: 5, description: "Offline queueing and synchronization demo" },
  { label: "Events & Reconciliation", path: "/events", icon: ListTree, phase: 5, description: "End-to-end event tracing and reconciliation" },
  { label: "Alerts & Exceptions", path: "/alerts", icon: AlertTriangle, phase: 3, description: "Operational alert management center" },
  { label: "Analytics & Reports", path: "/reports", icon: BarChart3, phase: 6, description: "Enterprise reporting centre" },
  { label: "Audit Trail", path: "/audit", icon: ScrollText, phase: 2, description: "Append-only log of system and user actions" },
  { label: "System Health", path: "/system-health", icon: HeartPulse, phase: 4, description: "Component availability and processing latency" },
  { label: "Administration & Settings", path: "/admin", icon: Settings, phase: 7, description: "Roles, permissions and simulator configuration" },
]

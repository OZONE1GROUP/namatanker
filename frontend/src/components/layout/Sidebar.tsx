import { NavLink } from "react-router-dom"
import { ChevronsLeft, ChevronsRight, Droplets } from "lucide-react"
import { NAV_ITEMS } from "@/config/navigation"
import { useAppStore } from "@/store/appStore"
import { cn } from "@/lib/utils"

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r transition-all duration-200",
        collapsed ? "w-[68px]" : "w-[264px]"
      )}
      style={{ background: "var(--app-nav-bg)", borderColor: "var(--app-border)" }}
    >
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500">
          <Droplets className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-white">OmanOne.tech</p>
            <p className="truncate text-[11px] text-(--app-nav-text)">Tanker Operations</p>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            title={collapsed ? item.label : undefined}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                isActive
                  ? "bg-white/10 font-medium text-white"
                  : "text-(--app-nav-text) hover:bg-white/5 hover:text-white"
              )
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && (
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            )}
            {!collapsed && item.phase > 1 && (
              <span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-(--app-nav-text)">
                P{item.phase}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center gap-2 border-t px-4 py-3 text-xs text-(--app-nav-text) hover:text-white"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        {!collapsed && "Collapse"}
      </button>
    </aside>
  )
}

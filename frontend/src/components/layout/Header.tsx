import { useLocation, useNavigate } from "react-router-dom"
import { Search, Bell, Moon, Sun, ChevronDown, LogOut, Settings } from "lucide-react"
import { useState } from "react"
import { NAV_ITEMS } from "@/config/navigation"
import { useAppStore } from "@/store/appStore"
import { useAuthStore } from "@/lib/auth"
import { ROLE_LABELS, initials } from "@/lib/roles"
import { SimulationClock } from "./SimulationClock"

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const [menuOpen, setMenuOpen] = useState(false)

  const roleLabel = user ? ROLE_LABELS[user.role] ?? user.role : ""

  const current = NAV_ITEMS.find(
    (n) => n.path === location.pathname || (n.path !== "/" && location.pathname.startsWith(n.path))
  ) ?? NAV_ITEMS[0]

  return (
    <header
      className="flex h-16 shrink-0 flex-col justify-center border-b px-6"
      style={{ background: "var(--app-header-bg)", borderColor: "var(--app-border)" }}
    >
      <div className="flex items-center justify-between">
        {/* Breadcrumb + title */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] text-(--app-text-muted)">
            <span>OmanOne.tech</span>
            <span>/</span>
            <span className="rounded bg-status-amber-bg px-1.5 py-0.5 font-semibold tracking-wide text-status-amber">
              SIMULATION MODE
            </span>
          </div>
          <h1 className="truncate text-base font-semibold text-(--app-text)">{current.label}</h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 rounded-lg border px-3 py-1.5 lg:flex" style={{ borderColor: "var(--app-border)" }}>
            <Search className="h-3.5 w-3.5 text-(--app-text-muted)" />
            <input
              placeholder="Search orders, tankers, stations…"
              className="w-56 bg-transparent text-sm text-(--app-text) placeholder:text-(--app-text-muted) focus:outline-none"
              disabled
              title="Global search arrives in Phase 2"
            />
          </div>

          <SimulationClock />

          <button
            className="relative rounded-lg border p-2 text-(--app-text-muted) hover:text-(--app-text)"
            style={{ borderColor: "var(--app-border)" }}
            title="Notifications (Phase 3)"
          >
            <Bell className="h-4 w-4" />
          </button>

          <button
            onClick={toggleTheme}
            className="rounded-lg border p-2 text-(--app-text-muted) hover:text-(--app-text)"
            style={{ borderColor: "var(--app-border)" }}
            title="Toggle theme"
          >
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--app-border)" }}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">
                {user ? initials(user.display_name) : "?"}
              </span>
              <span className="hidden flex-col items-start text-left md:flex">
                <span className="text-(--app-text) leading-tight">{user?.display_name ?? "Not signed in"}</span>
                <span className="text-[10px] leading-tight text-(--app-text-muted)">{roleLabel}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-(--app-text-muted)" />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-full z-20 mt-1.5 w-56 overflow-hidden rounded-lg border bg-(--app-surface) shadow-lg"
                style={{ borderColor: "var(--app-border)" }}
                onMouseLeave={() => setMenuOpen(false)}
              >
                <div className="px-3 py-2.5">
                  <p className="text-sm font-medium text-(--app-text)">{user?.display_name}</p>
                  <p className="text-xs text-(--app-text-muted)">{roleLabel} · demo account</p>
                </div>
                <div className="h-px" style={{ background: "var(--app-border)" }} />
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    navigate("/admin")
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
                >
                  <Settings className="h-3.5 w-3.5" /> Administration &amp; Settings
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    logout()
                    navigate("/login", { replace: true })
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-status-red hover:bg-black/5"
                >
                  <LogOut className="h-3.5 w-3.5" /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

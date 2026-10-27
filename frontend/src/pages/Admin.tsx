import { useEffect, useState } from "react"
import { Moon, Sun, ShieldCheck, Activity, Loader2, KeyRound } from "lucide-react"
import { getSimulationStatus, getHealth, type SimulationStatus, type HealthStatus } from "@/lib/api"
import { getDemoUsers, useAuthStore, type DemoUser } from "@/lib/auth"
import { useAppStore } from "@/store/appStore"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { initials } from "@/lib/roles"
import { formatDateTime } from "@/lib/utils"

interface PermissionRow {
  action: string
  roles: string[]
}

const PERMISSION_MATRIX: PermissionRow[] = [
  { action: "View orders, fleet, stations, reports, audit trail", roles: ["operator", "authorization_officer", "fleet_manager", "auditor", "admin"] },
  { action: "Create / assign / dispatch / progress orders", roles: ["operator", "authorization_officer", "fleet_manager", "admin"] },
  { action: "Authorize or reject a loading authorization", roles: ["authorization_officer", "admin"] },
  { action: "Disconnect / reconnect a station's edge gateway", roles: ["fleet_manager", "admin"] },
  { action: "Acknowledge / resolve / escalate alerts", roles: ["operator", "authorization_officer", "fleet_manager", "auditor", "admin"] },
  { action: "Pause / resume / change simulation clock speed", roles: ["admin"] },
]

const ALL_ROLES = ["operator", "authorization_officer", "fleet_manager", "auditor", "admin"]
const ROLE_LABELS: Record<string, string> = {
  operator: "Operator",
  authorization_officer: "Authorizer",
  fleet_manager: "Fleet Mgr",
  auditor: "Auditor",
  admin: "Admin",
}

export function Admin() {
  const user = useAuthStore((s) => s.user)
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const [sim, setSim] = useState<SimulationStatus | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [demoUsers, setDemoUsers] = useState<DemoUser[] | null>(null)

  useEffect(() => {
    getSimulationStatus().then(setSim).catch(() => {})
    getHealth().then(setHealth).catch(() => {})
    getDemoUsers().then(setDemoUsers).catch(() => {})
  }, [])

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-(--app-text-muted)">
          <strong className="text-(--app-text)">Administration &amp; Settings.</strong> Account, role-based access
          control reference, display preferences, and system status for this simulator.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Your account</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-900 text-sm font-semibold text-white">
                {user ? initials(user.display_name) : "?"}
              </span>
              <div>
                <p className="text-sm font-medium text-(--app-text)">{user?.display_name}</p>
                <p className="text-xs text-(--app-text-muted)">@{user?.username} · {ROLE_LABELS[user?.role ?? ""] ?? user?.role}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
              <div className="flex items-center gap-2 text-sm text-(--app-text)">
                {theme === "light" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                Appearance
              </div>
              <button
                onClick={toggleTheme}
                className="rounded-lg border px-3 py-1 text-xs font-medium text-(--app-text)"
                style={{ borderColor: "var(--app-border)" }}
              >
                {theme === "light" ? "Switch to dark" : "Switch to light"}
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>System status</CardTitle></CardHeader>
          <CardContent>
            {!sim || !health ? (
              <div className="flex items-center gap-2 py-6 text-sm text-(--app-text-muted)">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking backend…
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-(--app-text-muted)">API status</span>
                  <span className="flex items-center gap-1.5 font-medium text-status-green"><Activity className="h-3.5 w-3.5" /> {health.status}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-(--app-text-muted)">Mode</span>
                  <StatusBadge tone="amber" label={health.mode} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-(--app-text-muted)">Simulation clock</span>
                  <span className="font-medium tabular-nums text-(--app-text)">{formatDateTime(sim.simulation_time)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-(--app-text-muted)">Clock state</span>
                  <span className="font-medium text-(--app-text)">{sim.is_paused ? "Paused" : "Running"} · {sim.speed_multiplier}×</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roles &amp; permissions</CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-(--app-text-muted)"><ShieldCheck className="h-3.5 w-3.5" /> enforced server-side</span>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                <th className="py-2 pr-2 font-medium">Action</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="px-1 py-2 text-center font-medium">{ROLE_LABELS[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MATRIX.map((row) => (
                <tr key={row.action} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}>
                  <td className="py-2 pr-2 text-(--app-text)">{row.action}</td>
                  {ALL_ROLES.map((r) => (
                    <td key={r} className="px-1 py-2 text-center">
                      {row.roles.includes(r) ? (
                        <span className="text-status-green">●</span>
                      ) : (
                        <span className="text-(--app-text-muted)">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-(--app-text-muted)">
            Every row above is enforced by the API itself (FastAPI dependencies checking the logged-in user's role),
            not just hidden in the UI — a blocked action returns 403 even if called directly.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Demo accounts</CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-(--app-text-muted)"><KeyRound className="h-3.5 w-3.5" /> SIMULATION MODE</span>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-(--app-text-muted)">
            Synthetic demo credentials seeded by the simulator — never real secrets. Log out and back in as a
            different role to see the permission matrix above in action.
          </p>
          {!demoUsers ? (
            <div className="flex items-center gap-2 py-4 text-sm text-(--app-text-muted)">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                  <th className="py-2 font-medium">Username</th>
                  <th className="py-2 font-medium">Password</th>
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Display name</th>
                </tr>
              </thead>
              <tbody>
                {demoUsers.map((d) => (
                  <tr key={d.username} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}>
                    <td className="py-2 font-mono text-xs text-(--app-text)">{d.username}</td>
                    <td className="py-2 font-mono text-xs text-(--app-text-muted)">{d.password}</td>
                    <td className="py-2 text-(--app-text)">{d.role_label}</td>
                    <td className="py-2 text-(--app-text-muted)">{d.display_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

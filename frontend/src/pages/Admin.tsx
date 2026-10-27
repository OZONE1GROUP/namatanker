import { useEffect, useState } from "react"
import { Moon, Sun, ShieldCheck, Activity, Loader2, KeyRound, Wallet, CreditCard } from "lucide-react"
import {
  getSimulationStatus, getHealth,
  getPricing, setPricing, getPlatformSettings, updatePlatformSettings,
  type SimulationStatus, type HealthStatus, type PricingOut, type PlatformSettingsOut,
  ApiError,
} from "@/lib/api"
import { getDemoUsers, useAuthStore, type DemoUser } from "@/lib/auth"
import { useAppStore } from "@/store/appStore"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { initials } from "@/lib/roles"
import { prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatOMR } from "@/lib/utils"

const inputClass = "w-28 rounded-lg border bg-(--app-surface) px-2.5 py-1 text-sm text-(--app-text)"
const selectClass = "rounded-lg border bg-(--app-surface) px-2.5 py-1 text-sm text-(--app-text)"

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
  const isAdmin = user?.role === "admin"
  const theme = useAppStore((s) => s.theme)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const [sim, setSim] = useState<SimulationStatus | null>(null)
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [demoUsers, setDemoUsers] = useState<DemoUser[] | null>(null)
  const [pricing, setPricingRows] = useState<PricingOut[] | null>(null)
  const [platformSettings, setPlatformSettingsState] = useState<PlatformSettingsOut | null>(null)
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, string>>({})
  const [savingProduct, setSavingProduct] = useState<string | null>(null)
  const [commissionDraft, setCommissionDraft] = useState("")
  const [savingCommission, setSavingCommission] = useState(false)
  const [gatewayDraft, setGatewayDraft] = useState<{ enabled: boolean; provider: string; mode: string; reference: string }>({
    enabled: false, provider: "", mode: "test", reference: "",
  })
  const [savingGateway, setSavingGateway] = useState(false)
  const [financeError, setFinanceError] = useState<string | null>(null)

  useEffect(() => {
    getSimulationStatus().then(setSim).catch(() => {})
    getHealth().then(setHealth).catch(() => {})
    getDemoUsers().then(setDemoUsers).catch(() => {})
    getPricing().then((rows) => {
      setPricingRows(rows)
      setPricingDrafts(Object.fromEntries(rows.map((r) => [r.product, String(r.price_per_liter)])))
    }).catch(() => {})
    getPlatformSettings().then((s) => {
      setPlatformSettingsState(s)
      setCommissionDraft(String(s.platform_commission_pct))
      setGatewayDraft({
        enabled: s.payment_gateway_enabled,
        provider: s.payment_gateway_provider ?? "",
        mode: s.payment_gateway_mode,
        reference: s.payment_gateway_reference ?? "",
      })
    }).catch(() => {})
  }, [])

  async function savePrice(product: string) {
    const value = Number(pricingDrafts[product])
    if (!value || value <= 0) {
      setFinanceError("Enter a price per liter greater than 0.")
      return
    }
    setSavingProduct(product)
    setFinanceError(null)
    try {
      const updated = await setPricing(product, value)
      setPricingRows((rows) => rows?.map((r) => (r.product === product ? updated : r)) ?? rows)
    } catch (e) {
      setFinanceError(e instanceof ApiError ? e.message : "Failed to update price.")
    } finally {
      setSavingProduct(null)
    }
  }

  async function saveCommission() {
    const value = Number(commissionDraft)
    if (Number.isNaN(value) || value < 0 || value > 100) {
      setFinanceError("Commission percentage must be between 0 and 100.")
      return
    }
    setSavingCommission(true)
    setFinanceError(null)
    try {
      const updated = await updatePlatformSettings({ platform_commission_pct: value })
      setPlatformSettingsState(updated)
    } catch (e) {
      setFinanceError(e instanceof ApiError ? e.message : "Failed to update commission.")
    } finally {
      setSavingCommission(false)
    }
  }

  async function saveGateway() {
    setSavingGateway(true)
    setFinanceError(null)
    try {
      const updated = await updatePlatformSettings({
        payment_gateway_enabled: gatewayDraft.enabled,
        payment_gateway_provider: gatewayDraft.provider || null,
        payment_gateway_mode: gatewayDraft.mode,
        payment_gateway_reference: gatewayDraft.reference || null,
      })
      setPlatformSettingsState(updated)
    } catch (e) {
      setFinanceError(e instanceof ApiError ? e.message : "Failed to update payment gateway settings.")
    } finally {
      setSavingGateway(false)
    }
  }

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

      {financeError && (
        <Card className="border-status-red p-3 text-sm text-status-red">{financeError}</Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pricing &amp; Commission Settings</CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-(--app-text-muted)"><Wallet className="h-3.5 w-3.5" /> revenue-share model</span>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-(--app-text-muted)">
            Price per liter drives the order value shown across Orders and Order Detail. The commission
            percentage is the platform&apos;s cut of every closed order; the remainder is paid out to the station.
            {!isAdmin && " Only Admin can change these values."}
          </p>
          {!pricing ? (
            <div className="flex items-center gap-2 py-4 text-sm text-(--app-text-muted)">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 font-medium">Price per liter (OMR)</th>
                  {isAdmin && <th className="py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {pricing.map((row) => (
                  <tr key={row.product} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}>
                    <td className="py-2 text-(--app-text)">{prettyStatus(row.product)}</td>
                    <td className="py-2">
                      {isAdmin ? (
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={pricingDrafts[row.product] ?? ""}
                          onChange={(e) => setPricingDrafts((d) => ({ ...d, [row.product]: e.target.value }))}
                          className={inputClass}
                        />
                      ) : (
                        <span className="text-(--app-text-muted)">{formatOMR(row.price_per_liter)}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="py-2">
                        <Button variant="secondary" loading={savingProduct === row.product} onClick={() => savePrice(row.product)}>
                          Save
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-4 flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
            <div className="text-sm text-(--app-text)">
              Platform commission
              <p className="text-xs text-(--app-text-muted)">Percentage of each order&apos;s value retained by the platform.</p>
            </div>
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={commissionDraft}
                  onChange={(e) => setCommissionDraft(e.target.value)}
                  className={inputClass}
                />
                <span className="text-sm text-(--app-text-muted)">%</span>
                <Button variant="primary" loading={savingCommission} onClick={saveCommission}>Save</Button>
              </div>
            ) : (
              <span className="text-sm font-medium text-(--app-text)">{platformSettings?.platform_commission_pct ?? "—"}%</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Gateway Integration</CardTitle>
          <span className="flex items-center gap-1.5 text-xs text-(--app-text-muted)"><CreditCard className="h-3.5 w-3.5" /> SIMULATION MODE</span>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-(--app-text-muted)">
            A configuration surface for a future payment gateway — this never connects to a real processor or
            stores real payment credentials. When enabled, new revenue-share transactions are labeled as routed
            through the selected provider; everything still posts to the synthetic finance ledger below.
            {!isAdmin && " Only Admin can change these settings."}
          </p>
          {!platformSettings ? (
            <div className="flex items-center gap-2 py-4 text-sm text-(--app-text-muted)">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : isAdmin ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--app-border)" }}>
                <span className="text-sm text-(--app-text)">Enable payment gateway (demo)</span>
                <button
                  onClick={() => setGatewayDraft((d) => ({ ...d, enabled: !d.enabled }))}
                  className="rounded-lg border px-3 py-1 text-xs font-medium text-(--app-text)"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  {gatewayDraft.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-(--app-text-muted)">Provider</span>
                  <select
                    value={gatewayDraft.provider}
                    onChange={(e) => setGatewayDraft((d) => ({ ...d, provider: e.target.value }))}
                    className={`${selectClass} w-full`}
                  >
                    <option value="">None selected</option>
                    <option value="thawani">Thawani (Oman)</option>
                    <option value="omannet">OmanNet</option>
                    <option value="manual">Manual / Bank Transfer</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-(--app-text-muted)">Mode</span>
                  <select
                    value={gatewayDraft.mode}
                    onChange={(e) => setGatewayDraft((d) => ({ ...d, mode: e.target.value }))}
                    className={`${selectClass} w-full`}
                  >
                    <option value="test">Test</option>
                    <option value="live">Live</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-(--app-text-muted)">Reference (merchant/account id)</span>
                  <input
                    value={gatewayDraft.reference}
                    onChange={(e) => setGatewayDraft((d) => ({ ...d, reference: e.target.value }))}
                    placeholder="e.g. demo-merchant-001"
                    className={`${inputClass} w-full`}
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <Button variant="primary" loading={savingGateway} onClick={saveGateway}>Save gateway settings</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-(--app-text-muted)">Status</span>
                <StatusBadge tone={platformSettings.payment_gateway_enabled ? "green" : "grey"} label={platformSettings.payment_gateway_enabled ? "Enabled" : "Disabled"} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-(--app-text-muted)">Provider</span>
                <span className="font-medium text-(--app-text)">{platformSettings.payment_gateway_provider ? prettyStatus(platformSettings.payment_gateway_provider) : "None selected"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-(--app-text-muted)">Mode</span>
                <span className="font-medium text-(--app-text)">{prettyStatus(platformSettings.payment_gateway_mode)}</span>
              </div>
            </div>
          )}
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

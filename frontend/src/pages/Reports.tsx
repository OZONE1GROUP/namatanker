import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ClipboardList, Clock3, ShieldCheck, Gauge, Truck, PackageCheck,
  Droplets, Waves, AlertOctagon, Signal, SignalZero, Siren, Printer, Loader2,
} from "lucide-react"
import {
  getDashboard, getStations, getAlerts, getOrders,
  type DashboardResponse, type StationListItem, type AlertListItem, type OrderListItem,
} from "@/lib/api"
import { KpiCard } from "@/components/ui/KpiCard"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatNumber, formatVolume } from "@/lib/utils"

type Tone = "blue" | "teal" | "amber" | "red" | "green" | "grey"

/** Threshold banding for risk-type metrics — this is the "color-coded" part of the report. */
function tier(value: number, warnAt: number, criticalAt: number): Tone {
  if (value >= criticalAt) return "red"
  if (value >= warnAt) return "amber"
  return "green"
}

// Tailwind's scanner can't see class names built from a runtime variable
// (e.g. `bg-status-${tone}`), so those utilities get purged from the
// production build. Any color that depends on a computed tone/severity goes
// through this hex map and an inline style instead — same workaround used in
// EventsReconciliation.tsx's ToleranceBar.
const TONE_HEX: Record<string, string> = {
  green: "var(--color-status-green)",
  blue: "var(--color-status-blue)",
  amber: "var(--color-status-amber)",
  red: "var(--color-status-red)",
  grey: "var(--color-status-grey)",
  purple: "var(--color-status-purple)",
}

export function Reports() {
  const navigate = useNavigate()
  const [days, setDays] = useState(7)
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [stations, setStations] = useState<StationListItem[] | null>(null)
  const [alerts, setAlerts] = useState<AlertListItem[] | null>(null)
  const [exceptionOrders, setExceptionOrders] = useState<OrderListItem[] | null>(null)

  useEffect(() => {
    getDashboard({ days }).then(setData)
  }, [days])

  useEffect(() => {
    getStations().then(setStations)
    getAlerts({ page_size: 200 }).then((r) => setAlerts(r.items))
    Promise.all([
      getOrders({ status: "meter_discrepancy", page_size: 100 }),
      getOrders({ status: "failed_reconciliation", page_size: 100 }),
    ]).then(([a, b]) =>
      setExceptionOrders(
        [...a.items, ...b.items].sort((x, y) => y.created_at.localeCompare(x.created_at))
      )
    )
  }, [])

  const alertCounts = useMemo(() => {
    const counts = { info: 0, warning: 0, critical: 0 }
    alerts?.forEach((a) => {
      if (a.status !== "resolved") counts[a.severity] += 1
    })
    return counts
  }, [alerts])

  const k = data?.kpis
  const ready = data && stations && alerts && exceptionOrders

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--app-text-muted)">
          Color-coded operational report — every figure and row below drills down to the underlying orders, tankers,
          stations, and events it was computed from.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
            style={{ borderColor: "var(--app-border)" }}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm text-(--app-text) hover:bg-black/5"
            style={{ borderColor: "var(--app-border)" }}
          >
            <Printer className="h-3.5 w-3.5" /> Print Report
          </button>
        </div>
      </div>

      {!ready ? (
        <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
          <Loader2 className="h-4 w-4 animate-spin" /> Building report…
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-base font-semibold text-(--app-text)">Operational Report — Last {days} Days</h2>
            <p className="text-xs text-(--app-text-muted)">Generated {formatDateTime(data.simulation_time)} (simulation clock) · SIMULATION MODE, synthetic data only</p>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            <KpiCard label="Total Orders" value={formatNumber(k!.total_orders)} icon={ClipboardList} tone="blue" onClick={() => navigate("/orders")} />
            <KpiCard
              label="Awaiting Authorization"
              value={formatNumber(k!.orders_awaiting_authorization)}
              icon={Clock3}
              tone={tier(k!.orders_awaiting_authorization, 6, 16)}
              onClick={() => navigate("/orders?status=awaiting_authorization")}
            />
            <KpiCard label="Authorized Orders" value={formatNumber(k!.authorized_orders)} icon={ShieldCheck} tone="teal" onClick={() => navigate("/orders?status=authorized")} />
            <KpiCard label="Active Loading Ops" value={formatNumber(k!.active_loading_operations)} icon={Gauge} tone="blue" onClick={() => navigate("/live-operations")} />
            <KpiCard label="Tankers In Transit" value={formatNumber(k!.tankers_in_transit)} icon={Truck} tone="blue" onClick={() => navigate("/fleet?status=in_transit")} />
            <KpiCard label="Completed Deliveries" value={formatNumber(k!.completed_deliveries)} icon={PackageCheck} tone="green" onClick={() => navigate("/orders?status=closed")} />
            <KpiCard label="Volume Loaded" value={formatVolume(k!.total_volume_loaded_l)} icon={Droplets} tone="teal" onClick={() => navigate("/events")} />
            <KpiCard label="Volume Delivered" value={formatVolume(k!.volume_delivered_l)} icon={Waves} tone="teal" onClick={() => navigate("/events")} />
            <KpiCard
              label="Reconciliation Exceptions"
              value={formatNumber(k!.reconciliation_exceptions)}
              icon={AlertOctagon}
              tone={tier(k!.reconciliation_exceptions, 1, 4)}
              onClick={() => navigate("/events")}
            />
            <KpiCard
              label="Connected Stations"
              value={formatNumber(k!.connected_stations)}
              icon={Signal}
              tone={k!.offline_stations === 0 ? "green" : "amber"}
              onClick={() => navigate("/stations?connectivity_status=online")}
            />
            <KpiCard
              label="Offline Stations"
              value={formatNumber(k!.offline_stations)}
              icon={SignalZero}
              tone={tier(k!.offline_stations, 1, 2)}
              onClick={() => navigate("/stations?connectivity_status=offline")}
            />
            <KpiCard
              label="Critical Alerts"
              value={formatNumber(k!.critical_alerts)}
              icon={Siren}
              tone={tier(k!.critical_alerts, 1, 3)}
              onClick={() => navigate("/alerts?severity=critical")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Orders by Status</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {data.orders_by_status
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((s) => {
                      const max = Math.max(...data.orders_by_status.map((x) => x.count), 1)
                      const tone = statusTone(s.status)
                      return (
                        <li key={s.status}>
                          <button
                            onClick={() => navigate(`/orders?status=${s.status}`)}
                            className="flex w-full items-center gap-3 text-left hover:opacity-80"
                          >
                            <span className="w-40 shrink-0 truncate text-xs text-(--app-text-muted)">{prettyStatus(s.status)}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/5">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${(s.count / max) * 100}%`, background: TONE_HEX[tone] }}
                              />
                            </div>
                            <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-(--app-text)">{s.count}</span>
                          </button>
                        </li>
                      )
                    })}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Alert Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {(["info", "warning", "critical"] as const).map((sev) => (
                    <button
                      key={sev}
                      onClick={() => navigate(`/alerts?severity=${sev}`)}
                      className="rounded-xl border p-3 text-center hover:bg-black/[0.02]"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <p
                        className="text-2xl font-semibold tabular-nums"
                        style={{ color: TONE_HEX[sev === "info" ? "blue" : sev === "warning" ? "amber" : "red"] }}
                      >
                        {alertCounts[sev]}
                      </p>
                      <p className="mt-1 text-xs text-(--app-text-muted)">{prettyStatus(sev)} (open)</p>
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs text-(--app-text-muted)">Counts exclude resolved alerts. Click a tile to open filtered Alerts &amp; Exceptions.</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Station Performance</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                    <th className="py-2 font-medium">Station</th>
                    <th className="py-2 font-medium">Connectivity</th>
                    <th className="py-2 font-medium">Active Orders</th>
                    <th className="py-2 font-medium">Completed Orders</th>
                    <th className="py-2 font-medium">Unresolved Exceptions</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/stations/${s.id}`)}
                      className="cursor-pointer border-b last:border-0 hover:bg-black/[0.02]"
                      style={{ borderColor: "var(--app-border)" }}
                    >
                      <td className="py-2 font-medium text-(--app-text)">{s.name}</td>
                      <td className="py-2"><StatusBadge tone={statusTone(s.connectivity_status)} label={prettyStatus(s.connectivity_status)} /></td>
                      <td className="py-2 tabular-nums text-(--app-text-muted)">{s.active_orders}</td>
                      <td className="py-2 tabular-nums text-(--app-text-muted)">{s.completed_orders}</td>
                      <td className={`py-2 font-medium tabular-nums ${s.unresolved_exceptions > 0 ? "text-status-red" : "text-(--app-text-muted)"}`}>
                        {s.unresolved_exceptions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exception Report</CardTitle>
              <span className="text-xs text-(--app-text-muted)">Meter discrepancies &amp; failed reconciliations</span>
            </CardHeader>
            <CardContent>
              {exceptionOrders.length === 0 ? (
                <p className="py-4 text-center text-sm text-(--app-text-muted)">No exceptions recorded — every order has stayed within the ±2% tolerance band.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                      <th className="py-2 font-medium">Order</th>
                      <th className="py-2 font-medium">Station</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exceptionOrders.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => navigate(`/orders/${o.id}`)}
                        className="cursor-pointer border-b last:border-0 hover:bg-black/[0.02]"
                        style={{ borderColor: "var(--app-border)" }}
                      >
                        <td className="py-2 font-medium text-(--app-text)">{o.order_number}</td>
                        <td className="py-2 text-(--app-text-muted)">{o.station_name}</td>
                        <td className="py-2"><StatusBadge tone={statusTone(o.status)} label={prettyStatus(o.status)} /></td>
                        <td className="py-2 text-(--app-text-muted)">{formatDateTime(o.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

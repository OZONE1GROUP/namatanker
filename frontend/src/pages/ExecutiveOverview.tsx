import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ClipboardList,
  Clock3,
  ShieldCheck,
  Gauge,
  Truck,
  PackageCheck,
  Droplets,
  Waves,
  AlertOctagon,
  Signal,
  SignalZero,
  Siren,
  Info,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { getDashboard, getStations, type DashboardResponse, type StationListItem } from "@/lib/api"
import { KpiCard } from "@/components/ui/KpiCard"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { formatNumber, formatVolume } from "@/lib/utils"

const STATUS_COLORS: Record<string, string> = {
  draft: "#94a3b8",
  submitted: "#94a3b8",
  validated: "#3182ce",
  awaiting_authorization: "#d97706",
  authorized: "#3182ce",
  dispatched: "#3182ce",
  loading_in_progress: "#3182ce",
  loading_completed: "#3182ce",
  in_transit: "#3182ce",
  delivery_completed: "#16a34a",
  reconciliation_pending: "#d97706",
  reconciled: "#16a34a",
  closed: "#16a34a",
  rejected: "#dc2626",
  cancelled: "#94a3b8",
  expired_authorization: "#dc2626",
  meter_discrepancy: "#dc2626",
  failed_reconciliation: "#dc2626",
}

const TANKER_COLORS = ["#3182ce", "#0f9d92", "#d97706", "#94a3b8", "#16a34a"]

const INSIGHT_ICON = { info: Info, warning: AlertTriangle, critical: Siren } as const
const INSIGHT_TONE: Record<string, string> = {
  info: "text-status-blue bg-status-blue-bg",
  warning: "text-status-amber bg-status-amber-bg",
  critical: "text-status-red bg-status-red-bg",
}

function prettyStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ExecutiveOverview() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [stations, setStations] = useState<StationListItem[]>([])
  const [stationFilter, setStationFilter] = useState<string>("")
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStations().then(setStations).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    getDashboard({ station_id: stationFilter || undefined, days })
      .then(setData)
      .catch((e) => setError(e.message ?? "Failed to load dashboard"))
      .finally(() => setLoading(false))
  }, [stationFilter, days])

  if (error) {
    return (
      <Card className="mx-auto mt-16 max-w-lg p-6 text-center">
        <AlertOctagon className="mx-auto h-6 w-6 text-status-red" />
        <p className="mt-2 text-sm font-medium text-(--app-text)">Backend unreachable</p>
        <p className="mt-1 text-xs text-(--app-text-muted)">
          {error}. Start the API with <code className="rounded bg-black/5 px-1">uvicorn app.main:app</code> inside{" "}
          <code className="rounded bg-black/5 px-1">backend/</code>, then reload.
        </p>
      </Card>
    )
  }

  const k = data?.kpis

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-(--app-text-muted)">
            Enterprise-wide view of the simulated tanker loading and delivery operation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={stationFilter}
            onChange={(e) => setStationFilter(e.target.value)}
            className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
            style={{ borderColor: "var(--app-border)" }}
          >
            <option value="">All stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
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
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading simulated operations…
        </div>
      ) : (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            <KpiCard label="Total Orders" value={formatNumber(k?.total_orders ?? 0)} icon={ClipboardList} tone="blue" onClick={() => navigate("/orders")} />
            <KpiCard label="Awaiting Authorization" value={formatNumber(k?.orders_awaiting_authorization ?? 0)} icon={Clock3} tone="amber" onClick={() => navigate("/orders")} />
            <KpiCard label="Authorized Orders" value={formatNumber(k?.authorized_orders ?? 0)} icon={ShieldCheck} tone="teal" onClick={() => navigate("/orders")} />
            <KpiCard label="Active Loading Ops" value={formatNumber(k?.active_loading_operations ?? 0)} icon={Gauge} tone="blue" onClick={() => navigate("/tfs-simulator")} />
            <KpiCard label="Tankers In Transit" value={formatNumber(k?.tankers_in_transit ?? 0)} icon={Truck} tone="blue" onClick={() => navigate("/fleet")} />
            <KpiCard label="Completed Deliveries" value={formatNumber(k?.completed_deliveries ?? 0)} icon={PackageCheck} tone="green" onClick={() => navigate("/orders")} />
            <KpiCard label="Volume Loaded" value={formatVolume(k?.total_volume_loaded_l ?? 0)} icon={Droplets} tone="teal" onClick={() => navigate("/reports")} />
            <KpiCard label="Volume Delivered" value={formatVolume(k?.volume_delivered_l ?? 0)} icon={Waves} tone="teal" onClick={() => navigate("/reports")} />
            <KpiCard label="Reconciliation Exceptions" value={formatNumber(k?.reconciliation_exceptions ?? 0)} icon={AlertOctagon} tone="red" onClick={() => navigate("/events")} />
            <KpiCard label="Connected Stations" value={formatNumber(k?.connected_stations ?? 0)} icon={Signal} tone="green" onClick={() => navigate("/stations")} />
            <KpiCard label="Offline Stations" value={formatNumber(k?.offline_stations ?? 0)} icon={SignalZero} tone="grey" onClick={() => navigate("/stations")} />
            <KpiCard label="Critical Alerts" value={formatNumber(k?.critical_alerts ?? 0)} icon={Siren} tone="red" onClick={() => navigate("/alerts")} />
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Orders by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data?.orders_by_status ?? []} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
                    <XAxis
                      dataKey="status"
                      tickFormatter={prettyStatus}
                      tick={{ fontSize: 11, fill: "var(--app-text-muted)" }}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v) => [formatNumber(Number(v)), "Orders"]}
                      labelFormatter={(l) => prettyStatus(String(l))}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {(data?.orders_by_status ?? []).map((entry, i) => (
                        <Cell key={i} fill={STATUS_COLORS[entry.status] ?? "#3182ce"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Loading Volume by Station</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data?.volume_by_station ?? []} layout="vertical" margin={{ left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} tickFormatter={(v) => formatNumber(v)} />
                    <YAxis
                      dataKey="station_name"
                      type="category"
                      width={110}
                      tick={{ fontSize: 11, fill: "var(--app-text-muted)" }}
                    />
                    <Tooltip formatter={(v) => [formatVolume(Number(v)), "Volume"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="volume_l" fill="#0f9d92" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily Throughput Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={data?.daily_throughput ?? []} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} allowDecimals={false} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="orders" name="Orders" stroke="#3182ce" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tanker Activity by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data?.tanker_activity ?? []}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      label={(entry) => prettyStatus(String(entry.name ?? ""))}
                      labelLine={false}
                    >
                      {(data?.tanker_activity ?? []).map((_, i) => (
                        <Cell key={i} fill={TANKER_COLORS[i % TANKER_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [formatNumber(Number(v)), prettyStatus(String(n))]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Executive insights */}
          <Card>
            <CardHeader>
              <CardTitle>Executive Insights</CardTitle>
              <span className="text-xs text-(--app-text-muted)">Rule-based observations from current records</span>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.insights ?? []).length === 0 && (
                <p className="py-4 text-center text-sm text-(--app-text-muted)">No notable deviations in the current window.</p>
              )}
              {(data?.insights ?? []).map((insight) => {
                const Icon = INSIGHT_ICON[insight.severity]
                return (
                  <button
                    key={insight.id}
                    onClick={() => navigate(`/${insight.entity_type === "station" ? "stations" : insight.entity_type === "tanker" ? "fleet" : "orders"}`)}
                    className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition hover:bg-black/[0.02]"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <span className={`mt-0.5 shrink-0 rounded-md p-1.5 ${INSIGHT_TONE[insight.severity]}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm text-(--app-text)">{insight.message}</span>
                      <span className="mt-0.5 block text-xs text-(--app-text-muted)">
                        {insight.entity_type}: {insight.entity_label}
                      </span>
                    </span>
                  </button>
                )
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

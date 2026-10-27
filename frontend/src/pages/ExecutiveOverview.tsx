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
  Wallet,
  BadgeCheck,
  Radio,
  History,
  ArrowUpRight,
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
import { formatNumber, formatVolume, formatOMR } from "@/lib/utils"

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

const KYC_COLORS: Record<string, string> = {
  valid: "#16a34a",
  expiring_soon: "#d97706",
  expired: "#dc2626",
  missing: "#94a3b8",
}

const CONNECTIVITY_COLORS: Record<string, string> = {
  online: "#16a34a",
  degraded: "#d97706",
  offline: "#94a3b8",
}

const INSIGHT_ICON = { info: Info, warning: AlertTriangle, critical: Siren } as const
const INSIGHT_TONE: Record<string, string> = {
  info: "text-status-blue bg-status-blue-bg",
  warning: "text-status-amber bg-status-amber-bg",
  critical: "text-status-red bg-status-red-bg",
}

function prettyStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** A small "View <module>" link used in Module Report card headers. */
function ModuleLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 transition hover:text-teal-700 hover:underline"
    >
      {label} <ArrowUpRight className="h-3 w-3" />
    </button>
  )
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

          {/* Module Reports — live reporting surfaced from every deployed platform module */}
          <div>
            <h2 className="text-sm font-semibold text-(--app-text)">Module Reports</h2>
            <p className="text-xs text-(--app-text-muted)">Live reporting across every deployed platform module.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Finance & Revenue Share */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-status-green-bg p-1.5 text-status-green">
                    <Wallet className="h-3.5 w-3.5" />
                  </span>
                  <CardTitle>Finance &amp; Revenue Share</CardTitle>
                </div>
                <ModuleLink label="Finance" onClick={() => navigate("/finance")} />
              </CardHeader>
              <CardContent>
                <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-(--app-text-muted)">Inbound</p>
                    <p className="text-sm font-semibold text-(--app-text)">{formatOMR(data?.finance.total_inbound ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-(--app-text-muted)">Outbound</p>
                    <p className="text-sm font-semibold text-(--app-text)">{formatOMR(data?.finance.total_outbound ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-(--app-text-muted)">Net Revenue</p>
                    <p className="text-sm font-semibold text-status-green">{formatOMR(data?.finance.platform_net_revenue ?? 0)}</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart
                    data={[
                      { label: "Inbound", value: data?.finance.total_inbound ?? 0, fill: "#3182ce" },
                      { label: "Outbound", value: data?.finance.total_outbound ?? 0, fill: "#d97706" },
                      { label: "Net Revenue", value: data?.finance.platform_net_revenue ?? 0, fill: "#16a34a" },
                    ]}
                    layout="vertical"
                    margin={{ left: 12 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} tickFormatter={(v) => formatNumber(v)} />
                    <YAxis dataKey="label" type="category" width={80} tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} />
                    <Tooltip formatter={(v) => [formatOMR(Number(v)), "Amount"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {[0, 1, 2].map((i) => (
                        <Cell key={i} fill={["#3182ce", "#d97706", "#16a34a"][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-1 text-center text-xs text-(--app-text-muted)">
                  {formatNumber(data?.finance.transaction_count ?? 0)} transactions over the last {data?.finance.period_days ?? days} days
                </p>
              </CardContent>
            </Card>

            {/* Driver & Vehicle KYC Compliance */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-status-blue-bg p-1.5 text-status-blue">
                    <BadgeCheck className="h-3.5 w-3.5" />
                  </span>
                  <CardTitle>Driver &amp; Vehicle KYC Compliance</CardTitle>
                </div>
                <div className="flex gap-2">
                  <ModuleLink label="Drivers" onClick={() => navigate("/drivers")} />
                  <ModuleLink label="Fleet" onClick={() => navigate("/fleet")} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-3 grid grid-cols-2 gap-2 text-center">
                  <div>
                    <p className="text-xs text-(--app-text-muted)">Drivers ({formatNumber(data?.kyc.drivers_total ?? 0)})</p>
                    <p className="text-sm font-semibold text-status-red">
                      {formatNumber(data?.kyc.drivers.expired ?? 0)} expired
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-(--app-text-muted)">Tankers ({formatNumber(data?.kyc.tankers_total ?? 0)})</p>
                    <p className="text-sm font-semibold text-status-red">
                      {formatNumber(data?.kyc.tankers.expired ?? 0)} expired
                    </p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart
                    data={[
                      { entity: "Drivers", ...data?.kyc.drivers },
                      { entity: "Tankers", ...data?.kyc.tankers },
                    ]}
                    margin={{ left: -20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
                    <XAxis dataKey="entity" tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} allowDecimals={false} />
                    <Tooltip
                      formatter={(v, n) => [formatNumber(Number(v)), prettyStatus(String(n))]}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Bar dataKey="valid" name="valid" stackId="kyc" fill={KYC_COLORS.valid} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="expiring_soon" name="expiring_soon" stackId="kyc" fill={KYC_COLORS.expiring_soon} />
                    <Bar dataKey="expired" name="expired" stackId="kyc" fill={KYC_COLORS.expired} />
                    <Bar dataKey="missing" name="missing" stackId="kyc" fill={KYC_COLORS.missing} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Station Connectivity */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-status-teal-bg p-1.5 text-status-teal">
                    <Radio className="h-3.5 w-3.5" />
                  </span>
                  <CardTitle>Station Connectivity</CardTitle>
                </div>
                <ModuleLink label="Stations" onClick={() => navigate("/stations")} />
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "online", value: data?.connectivity.online ?? 0 },
                        { name: "degraded", value: data?.connectivity.degraded ?? 0 },
                        { name: "offline", value: data?.connectivity.offline ?? 0 },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      label={(entry) => prettyStatus(String(entry.name ?? ""))}
                      labelLine={false}
                    >
                      {["online", "degraded", "offline"].map((status) => (
                        <Cell key={status} fill={CONNECTIVITY_COLORS[status]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [formatNumber(Number(v)), prettyStatus(String(n))]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Audit Trail Activity */}
            <Card>
              <CardHeader className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-status-amber-bg p-1.5 text-status-amber">
                    <History className="h-3.5 w-3.5" />
                  </span>
                  <CardTitle>Audit Trail Activity</CardTitle>
                </div>
                <ModuleLink label="Audit" onClick={() => navigate("/audit")} />
              </CardHeader>
              <CardContent>
                <div className="mb-2 grid grid-cols-2 gap-2 text-center">
                  <div>
                    <p className="text-xs text-(--app-text-muted)">Last 24 hours</p>
                    <p className="text-sm font-semibold text-(--app-text)">{formatNumber(data?.audit.actions_last_24h ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-(--app-text-muted)">Last 7 days</p>
                    <p className="text-sm font-semibold text-(--app-text)">{formatNumber(data?.audit.actions_last_7d ?? 0)}</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={data?.audit.trend ?? []} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--app-border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--app-text-muted)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--app-text-muted)" }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [formatNumber(Number(v)), "Actions"]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Bar dataKey="count" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
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

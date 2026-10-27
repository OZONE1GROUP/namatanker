import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, Fuel, AlertTriangle } from "lucide-react"
import { getStations, type StationListItem } from "@/lib/api"
import { Card } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatNumber } from "@/lib/utils"

const ALL_CONNECTIVITY_STATUSES = ["online", "degraded", "offline"]

export function Stations() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [stations, setStations] = useState<StationListItem[] | null>(null)

  const connectivityFilter = params.get("connectivity_status") ?? ""

  useEffect(() => {
    getStations().then(setStations)
  }, [])

  if (!stations) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading stations…
      </div>
    )
  }

  const filtered = connectivityFilter ? stations.filter((s) => s.connectivity_status === connectivityFilter) : stations

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--app-text-muted)">
          {formatNumber(filtered.length)} of {formatNumber(stations.length)} stations, each simulating an edge gateway with its own connectivity state.
        </p>
        <select
          value={connectivityFilter}
          onChange={(e) => {
            const next = new URLSearchParams(params)
            if (e.target.value) next.set("connectivity_status", e.target.value)
            else next.delete("connectivity_status")
            setParams(next)
          }}
          className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
          style={{ borderColor: "var(--app-border)" }}
        >
          <option value="">All connectivity</option>
          {ALL_CONNECTIVITY_STATUSES.map((s) => <option key={s} value={s}>{prettyStatus(s)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <Card key={s.id} onClick={() => navigate(`/stations/${s.id}`)} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-(--app-text)">{s.name}</p>
                <p className="text-xs text-(--app-text-muted)">{s.station_code} · {s.location}</p>
              </div>
              <StatusBadge tone={statusTone(s.connectivity_status)} label={prettyStatus(s.connectivity_status)} />
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-(--app-text-muted)">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Fuel className="h-3.5 w-3.5" /> Loading bays</span>
                <span className="font-medium text-(--app-text)">{s.loading_bay_count}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Active orders</span>
                <span className="font-medium text-(--app-text)">{s.active_orders}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Completed orders</span>
                <span className="font-medium text-(--app-text)">{s.completed_orders}</span>
              </div>
              {s.unresolved_exceptions > 0 && (
                <div className="flex items-center justify-between text-status-red">
                  <span className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Exceptions</span>
                  <span className="font-medium">{s.unresolved_exceptions}</span>
                </div>
              )}
              {s.last_heartbeat && (
                <div className="flex items-center justify-between">
                  <span>Last heartbeat</span>
                  <span className="font-medium text-(--app-text)">{formatDateTime(s.last_heartbeat)}</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

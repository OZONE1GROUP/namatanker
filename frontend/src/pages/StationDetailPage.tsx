import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { getStation, type StationDetail } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatNumber } from "@/lib/utils"

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-(--app-text-muted)">{label}</span>
      <span className="text-sm font-medium text-(--app-text)">{value ?? "—"}</span>
    </div>
  )
}

export function StationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [station, setStation] = useState<StationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getStation(id).then(setStation).catch(() => setNotFound(true)).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading station…
      </div>
    )
  }

  if (notFound || !station) {
    return (
      <div className="space-y-4">
        <BackLink navigate={navigate} />
        <Card className="p-8 text-center text-(--app-text-muted)">Station not found.</Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackLink navigate={navigate} />

      <div className="flex items-center gap-2.5">
        <h2 className="text-lg font-semibold text-(--app-text)">{station.name}</h2>
        <StatusBadge tone={statusTone(station.connectivity_status)} label={prettyStatus(station.connectivity_status)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <div>
              <InfoRow label="Station code" value={station.station_code} />
              <InfoRow label="Location" value={station.location} />
              <InfoRow label="Edge gateway" value={station.edge_gateway_id} />
            </div>
            <div>
              <InfoRow label="Last heartbeat" value={station.last_heartbeat ? formatDateTime(station.last_heartbeat) : "No signal (simulated)"} />
              <InfoRow label="Completed orders" value={formatNumber(station.completed_orders_count)} />
              <InfoRow label="Throughput volume" value={`${formatNumber(station.throughput_volume_l)} L`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Loading Bays ({station.loading_bays.length})</CardTitle></CardHeader>
          <CardContent>
            {station.loading_bays.length === 0 ? (
              <p className="text-sm text-(--app-text-muted)">No bays configured.</p>
            ) : (
              <ul className="space-y-2">
                {station.loading_bays.map((b) => (
                  <li key={b.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--app-border)" }}>
                    <div>
                      <p className="font-medium text-(--app-text)">{b.bay_code}</p>
                      {b.current_order_number && (
                        <p
                          className="cursor-pointer text-xs text-(--app-text-muted) hover:underline"
                          onClick={() => b.current_order_id && navigate(`/orders/${b.current_order_id}`)}
                        >
                          {b.current_order_number}
                        </p>
                      )}
                    </div>
                    <StatusBadge tone={statusTone(b.status)} label={prettyStatus(b.status)} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Active Orders ({station.active_orders.length})</CardTitle></CardHeader>
        <CardContent>
          {station.active_orders.length === 0 ? (
            <p className="text-sm text-(--app-text-muted)">No active orders at this station.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                  <th className="py-2 font-medium">Order</th>
                  <th className="py-2 font-medium">Product</th>
                  <th className="py-2 font-medium">Tanker</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {station.active_orders.map((o) => (
                  <tr key={o.id} className="cursor-pointer border-b last:border-0 hover:bg-black/[0.02]" style={{ borderColor: "var(--app-border)" }} onClick={() => navigate(`/orders/${o.id}`)}>
                    <td className="py-2 font-medium text-(--app-text)">{o.order_number}</td>
                    <td className="py-2 text-(--app-text-muted)">{prettyStatus(o.product)}</td>
                    <td className="py-2 text-(--app-text-muted)">{o.tanker_code ?? "—"}</td>
                    <td className="py-2"><StatusBadge tone={statusTone(o.status)} label={prettyStatus(o.status)} /></td>
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

function BackLink({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <button onClick={() => navigate("/stations")} className="inline-flex items-center gap-1.5 text-sm text-(--app-text-muted) hover:text-(--app-text)">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to Stations
    </button>
  )
}

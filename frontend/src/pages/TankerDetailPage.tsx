import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import { getTanker, type TankerDetail } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatDate, formatNumber } from "@/lib/utils"

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-(--app-text-muted)">{label}</span>
      <span className="text-sm font-medium text-(--app-text)">{value ?? "—"}</span>
    </div>
  )
}

export function TankerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tanker, setTanker] = useState<TankerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getTanker(id).then(setTanker).catch(() => setNotFound(true)).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading tanker…
      </div>
    )
  }

  if (notFound || !tanker) {
    return (
      <div className="space-y-4">
        <BackLink navigate={navigate} />
        <Card className="p-8 text-center text-(--app-text-muted)">Tanker not found.</Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackLink navigate={navigate} />

      <div className="flex items-center gap-2.5">
        <h2 className="text-lg font-semibold text-(--app-text)">{tanker.tanker_code}</h2>
        <StatusBadge tone={statusTone(tanker.status)} label={prettyStatus(tanker.status)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Tanker Details</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <div>
              <InfoRow label="Registration" value={tanker.registration_number} />
              <InfoRow label="Capacity" value={`${formatNumber(tanker.capacity_l)} L`} />
              <InfoRow label="Assigned product" value={prettyStatus(tanker.assigned_product)} />
              <InfoRow label="Driver" value={tanker.driver_name} />
            </div>
            <div>
              <InfoRow label="GPS signal" value={tanker.gps_signal_ok ? "OK" : "No signal (simulated)"} />
              <InfoRow label="Last position" value={tanker.last_lat != null && tanker.last_lon != null ? `${tanker.last_lat.toFixed(4)}, ${tanker.last_lon.toFixed(4)}` : null} />
              <InfoRow label="Last comm." value={tanker.last_comm_at ? formatDateTime(tanker.last_comm_at) : null} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Vehicle KYC</CardTitle>
            <StatusBadge tone={statusTone(tanker.kyc.overall_status)} label={prettyStatus(tanker.kyc.overall_status)} />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            <div>
              <InfoRow label="Registration (Istimara) no." value={tanker.registration_number} />
              <InfoRow label="Registration expiry" value={tanker.kyc.registration_expiry ? formatDate(tanker.kyc.registration_expiry) : null} />
              <InfoRow label="Registration status" value={<StatusBadge tone={statusTone(tanker.kyc.registration_status)} label={prettyStatus(tanker.kyc.registration_status)} />} />
            </div>
            <div>
              <InfoRow label="Insurance no." value={tanker.kyc.insurance_number} />
              <InfoRow label="Insurance expiry" value={tanker.kyc.insurance_expiry ? formatDate(tanker.kyc.insurance_expiry) : null} />
              <InfoRow label="Insurance status" value={<StatusBadge tone={statusTone(tanker.kyc.insurance_status)} label={prettyStatus(tanker.kyc.insurance_status)} />} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader>
          <CardContent>
            {tanker.recent_orders.length === 0 ? (
              <p className="text-sm text-(--app-text-muted)">No orders recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {tanker.recent_orders.map((o) => (
                  <li key={o.id} className="cursor-pointer rounded-lg border p-2.5 text-sm hover:bg-black/[0.02]" style={{ borderColor: "var(--app-border)" }} onClick={() => navigate(`/orders/${o.id}`)}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-(--app-text)">{o.order_number}</span>
                      <StatusBadge tone={statusTone(o.status)} label={prettyStatus(o.status)} />
                    </div>
                    <p className="mt-1 text-xs text-(--app-text-muted)">{o.station_name} · {formatDateTime(o.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function BackLink({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <button onClick={() => navigate("/fleet")} className="inline-flex items-center gap-1.5 text-sm text-(--app-text-muted) hover:text-(--app-text)">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to Fleet
    </button>
  )
}

import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, Gauge, Radio, RadioOff, Plus } from "lucide-react"
import { getTankers, type TankerListItem } from "@/lib/api"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatNumber } from "@/lib/utils"
import { useAuthStore } from "@/lib/auth"
import { NewTankerModal } from "@/components/fleet/NewTankerModal"

const ALL_TANKER_STATUSES = [
  "idle", "dispatched", "at_station", "loading", "in_transit", "delivering", "returning", "maintenance", "offline",
]

const FLEET_ROLES = ["fleet_manager", "admin"]

export function Fleet() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tankers, setTankers] = useState<TankerListItem[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const role = useAuthStore((s) => s.user?.role)
  const canRegister = !!role && FLEET_ROLES.includes(role)

  const statusFilter = params.get("status") ?? ""

  useEffect(() => {
    getTankers().then(setTankers)
  }, [])

  if (!tankers) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading fleet…
      </div>
    )
  }

  const filtered = statusFilter ? tankers.filter((t) => t.status === statusFilter) : tankers

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--app-text-muted)">
          {formatNumber(filtered.length)} of {formatNumber(tankers.length)} tankers, with live (simulated) GPS and status telemetry.
        </p>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              const next = new URLSearchParams(params)
              if (e.target.value) next.set("status", e.target.value)
              else next.delete("status")
              setParams(next)
            }}
            className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
            style={{ borderColor: "var(--app-border)" }}
          >
            <option value="">All statuses</option>
            {ALL_TANKER_STATUSES.map((s) => <option key={s} value={s}>{prettyStatus(s)}</option>)}
          </select>
          {canRegister && (
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New Tanker
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => (
          <Card key={t.id} onClick={() => navigate(`/fleet/${t.id}`)} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-(--app-text)">{t.tanker_code}</p>
                <p className="text-xs text-(--app-text-muted)">{t.registration_number}</p>
              </div>
              <StatusBadge tone={statusTone(t.status)} label={prettyStatus(t.status)} />
            </div>

            <div className="mt-3 space-y-1.5 text-xs text-(--app-text-muted)">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5" /> Capacity</span>
                <span className="font-medium text-(--app-text)">{formatNumber(t.capacity_l)} L</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Product</span>
                <span className="font-medium text-(--app-text)">{prettyStatus(t.assigned_product)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Driver</span>
                <span className="font-medium text-(--app-text)">{t.driver_name ?? "Unassigned"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  {t.gps_signal_ok ? <Radio className="h-3.5 w-3.5 text-status-green" /> : <RadioOff className="h-3.5 w-3.5 text-status-red" />}
                  GPS
                </span>
                <span className="font-medium text-(--app-text)">{t.gps_signal_ok ? "Signal OK" : "No signal"}</span>
              </div>
              {t.current_order_number && (
                <div className="flex items-center justify-between">
                  <span>Current order</span>
                  <span className="font-medium text-(--app-text)">{t.current_order_number}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span>KYC</span>
                <StatusBadge tone={statusTone(t.kyc_status)} label={prettyStatus(t.kyc_status)} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <NewTankerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={(tanker) =>
          setTankers((prev) =>
            prev
              ? [
                  ...prev,
                  {
                    id: tanker.id,
                    tanker_code: tanker.tanker_code,
                    registration_number: tanker.registration_number,
                    capacity_l: tanker.capacity_l,
                    assigned_product: tanker.assigned_product,
                    status: tanker.status,
                    gps_signal_ok: tanker.gps_signal_ok,
                    driver_name: tanker.driver_name,
                    current_order_number: null,
                    kyc_status: tanker.kyc.overall_status,
                  },
                ]
              : prev
          )
        }
      />
    </div>
  )
}

import { useEffect, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { getDrivers, type DriverListItem } from "@/lib/api"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatNumber, formatDate } from "@/lib/utils"
import { useAuthStore } from "@/lib/auth"
import { NewDriverModal } from "@/components/fleet/NewDriverModal"

const FLEET_ROLES = ["fleet_manager", "admin"]

export function Drivers() {
  const [drivers, setDrivers] = useState<DriverListItem[] | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const role = useAuthStore((s) => s.user?.role)
  const canRegister = !!role && FLEET_ROLES.includes(role)

  useEffect(() => {
    getDrivers().then(setDrivers)
  }, [])

  if (!drivers) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading drivers…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--app-text-muted)">
          {formatNumber(drivers.length)} drivers on the roster. KYC = license + civil ID validity (SIMULATION MODE demo documents) — an
          expired document blocks assignment to a new order.
        </p>
        {canRegister && (
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Driver
          </Button>
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
              <th className="px-4 py-2.5 font-medium">Driver</th>
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 font-medium">Duty Status</th>
              <th className="px-4 py-2.5 font-medium">Qualification</th>
              <th className="px-4 py-2.5 font-medium">Assigned Tanker</th>
              <th className="px-4 py-2.5 font-medium">Civil ID</th>
              <th className="px-4 py-2.5 font-medium">License</th>
              <th className="px-4 py-2.5 font-medium">KYC</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}>
                <td className="px-4 py-2.5 font-medium text-(--app-text)">{d.display_name}</td>
                <td className="px-4 py-2.5 text-(--app-text-muted)">{d.driver_code}</td>
                <td className="px-4 py-2.5"><StatusBadge tone={statusTone(d.duty_status)} label={prettyStatus(d.duty_status)} /></td>
                <td className="px-4 py-2.5"><StatusBadge tone={statusTone(d.qualification_status)} label={prettyStatus(d.qualification_status)} /></td>
                <td className="px-4 py-2.5 text-(--app-text-muted)">{d.assigned_tanker_code ?? "—"}</td>
                <td className="px-4 py-2.5 text-(--app-text-muted)">
                  {d.kyc.civil_id_number ? (
                    <span className="flex flex-col">
                      <span className="font-mono text-xs">{d.kyc.civil_id_number}</span>
                      <span className="text-xs">{d.kyc.civil_id_expiry && formatDate(d.kyc.civil_id_expiry)}</span>
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-2.5 text-(--app-text-muted)">
                  {d.kyc.license_number ? (
                    <span className="flex flex-col">
                      <span className="font-mono text-xs">{d.kyc.license_number}</span>
                      <span className="text-xs">{d.kyc.license_expiry && formatDate(d.kyc.license_expiry)}</span>
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-2.5"><StatusBadge tone={statusTone(d.kyc.overall_status)} label={prettyStatus(d.kyc.overall_status)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <NewDriverModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={(driver) => setDrivers((prev) => (prev ? [...prev, driver] : [driver]))}
      />
    </div>
  )
}

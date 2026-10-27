import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { getDrivers, type DriverListItem } from "@/lib/api"
import { Card } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatNumber } from "@/lib/utils"

export function Drivers() {
  const [drivers, setDrivers] = useState<DriverListItem[] | null>(null)

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
      <p className="text-sm text-(--app-text-muted)">{formatNumber(drivers.length)} drivers on the roster.</p>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
              <th className="px-4 py-2.5 font-medium">Driver</th>
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 font-medium">Duty Status</th>
              <th className="px-4 py-2.5 font-medium">Qualification</th>
              <th className="px-4 py-2.5 font-medium">Assigned Tanker</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

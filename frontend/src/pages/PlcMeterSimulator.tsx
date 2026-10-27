import { useEffect, useState } from "react"
import { Cpu, Wifi, WifiOff } from "lucide-react"
import { useLiveSnapshot } from "@/lib/useLiveSnapshot"
import { getStations, type StationListItem } from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"

/** Small deterministic string hash -> [0,1), so simulated register noise
 *  stays stable between renders of the same tick instead of flickering. */
function pseudoRandom(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

const REGISTERS = [
  { label: "Flow Rate", unit: "L/min", address: "40001" },
  { label: "Totalizer", unit: "L", address: "40002" },
  { label: "Product Temperature", unit: "°C", address: "40003" },
  { label: "Line Pressure", unit: "bar", address: "40004" },
  { label: "Density", unit: "kg/m³", address: "40005" },
]

export function PlcMeterSimulator() {
  const { snapshot } = useLiveSnapshot()
  const [stations, setStations] = useState<StationListItem[] | null>(null)

  useEffect(() => {
    getStations().then(setStations)
  }, [])

  if (!stations) {
    return <p className="py-10 text-center text-sm text-(--app-text-muted)">Loading stations…</p>
  }

  const tick = snapshot?.generated_at ?? "idle"

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--app-text-muted)">
        PLC &amp; Meter diagnostics simulator — SIMULATION MODE. Register values and link diagnostics below are synthetic, generated from the simulation engine; this page is never wired to a real PLC or flow meter.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stations.map((station) => {
          const bayTelemetry = (snapshot?.loading ?? []).filter((l) => l.station_id === station.id)
          const active = bayTelemetry[0]
          const linkQuality =
            station.connectivity_status === "online"
              ? 92 + Math.round(pseudoRandom(station.id + tick) * 8)
              : station.connectivity_status === "degraded"
                ? 55 + Math.round(pseudoRandom(station.id + tick) * 25)
                : 0

          return (
            <Card key={station.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-teal-500" /> {station.station_code} Edge PLC
                </CardTitle>
                <StatusBadge tone={statusTone(station.connectivity_status)} label={prettyStatus(station.connectivity_status)} />
              </CardHeader>
              <CardContent>
                <div className="mb-3 flex items-center justify-between text-xs text-(--app-text-muted)">
                  <span className="flex items-center gap-1.5">
                    {linkQuality > 0 ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5 text-status-red" />}
                    Link quality: {linkQuality}%
                  </span>
                  <span>Firmware v2.4.{(pseudoRandom(station.id) * 9 | 0)}-sim</span>
                  <span>Fault: {linkQuality > 20 ? "None" : "Comms timeout (simulated)"}</span>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                      <th className="py-1.5 font-medium">Register</th>
                      <th className="py-1.5 font-medium">Address</th>
                      <th className="py-1.5 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REGISTERS.map((reg, i) => {
                      let value: string
                      if (reg.label === "Flow Rate") {
                        value = active ? active.flow_rate_l_min.toFixed(1) : "0.0"
                      } else if (reg.label === "Totalizer") {
                        value = active ? active.live_volume_l.toString() : "—"
                      } else {
                        const base = [34, 2.1, 835][i - 2] ?? 0
                        const jitter = (pseudoRandom(station.id + reg.label + tick) - 0.5) * (base * 0.04)
                        value = (base + jitter).toFixed(1)
                      }
                      return (
                        <tr key={reg.address} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}>
                          <td className="py-1.5 text-(--app-text)">{reg.label}</td>
                          <td className="py-1.5 text-(--app-text-muted)">{reg.address}</td>
                          <td className="py-1.5 text-right font-medium tabular-nums text-(--app-text)">
                            {value} <span className="text-(--app-text-muted)">{reg.unit}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {bayTelemetry.length > 1 && (
                  <p className="mt-2 text-xs text-(--app-text-muted)">
                    {bayTelemetry.length} bays active — showing {active?.bay_code}; others: {bayTelemetry.slice(1).map((b) => b.bay_code).join(", ")}.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

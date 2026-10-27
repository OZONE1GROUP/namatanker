import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Fuel, Gauge } from "lucide-react"
import { useLiveSnapshot } from "@/lib/useLiveSnapshot"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { orderActions, ApiError } from "@/lib/api"
import { formatNumber } from "@/lib/utils"

export function TfsSimulator() {
  const navigate = useNavigate()
  const { snapshot } = useLiveSnapshot()
  const [selectedId, setSelectedId] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loading = snapshot?.loading ?? []

  useEffect(() => {
    if (loading.length === 0) {
      if (selectedId) setSelectedId("")
      return
    }
    if (!loading.find((l) => l.order_id === selectedId)) {
      setSelectedId(loading[0].order_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const active = loading.find((l) => l.order_id === selectedId) ?? null

  async function stopAndComplete() {
    if (!active) return
    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const res = await orderActions.completeLoading(active.order_id, active.live_volume_l)
      setMessage(res.message)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to complete loading")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--app-text-muted)">
        Terminal Filling System simulator — SIMULATION MODE. Visualizes a simulated filling head's flow rate and totalizer for an active bay; it is never connected to a real TFS or PLC.
      </p>

      <Card className="p-4">
        <label className="mb-1 block text-xs font-medium text-(--app-text-muted)">Active loading bay</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={loading.length === 0}
          className="w-full max-w-md rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text) disabled:opacity-50"
          style={{ borderColor: "var(--app-border)" }}
        >
          {loading.length === 0 && <option value="">No active loading bays</option>}
          {loading.map((l) => (
            <option key={l.order_id} value={l.order_id}>
              {l.station_name} · {l.bay_code} — {l.order_number}
            </option>
          ))}
        </select>
      </Card>

      {!active ? (
        <Card className="p-10 text-center text-sm text-(--app-text-muted)">
          No bay is currently filling. Start loading on an order from Orders &amp; Authorizations to see it here.
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle>{active.station_name} · {active.bay_code}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
              <div>
                <p className="text-xs text-(--app-text-muted)">
                  Tanker {active.tanker_code} · {active.product.replace(/_/g, " ")}
                </p>
                <p className="mt-2 text-4xl font-bold tabular-nums text-(--app-text)">
                  {formatNumber(active.live_volume_l)}{" "}
                  <span className="text-base font-medium text-(--app-text-muted)">/ {formatNumber(active.target_volume_l)} L</span>
                </p>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-black/5">
                  <div className="h-full bg-teal-500 transition-[width]" style={{ width: `${active.progress_pct}%` }} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-(--app-text-muted)">
                  <span className="flex items-center gap-1"><Gauge className="h-3.5 w-3.5" /> {active.flow_rate_l_min.toFixed(0)} L/min simulated flow rate</span>
                  <span>{active.progress_pct.toFixed(1)}% full</span>
                  {active.ready_to_complete && <span className="font-medium text-status-green">Ready to complete</span>}
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <Button variant="primary" loading={submitting} onClick={stopAndComplete}>
                  <Fuel className="h-4 w-4" /> Stop &amp; Record Loaded Volume
                </Button>
                <p className="max-w-[220px] text-right text-xs text-(--app-text-muted)">
                  Records the current simulated totalizer reading as the actual loaded quantity.
                </p>
                <Button variant="secondary" onClick={() => navigate(`/orders/${active.order_id}`)}>View Order</Button>
              </div>
            </div>
            {message && <p className="mt-3 text-sm text-status-green">{message}</p>}
            {error && <p className="mt-3 text-sm text-status-red">{error}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

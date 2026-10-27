import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Plus, ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import {
  getOrders,
  getStations,
  type OrderListItem,
  type StationListItem,
} from "@/lib/api"
import { Card } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatNumber } from "@/lib/utils"
import { NewOrderModal } from "@/components/orders/NewOrderModal"

const ALL_STATUSES = [
  "submitted", "awaiting_authorization", "authorized", "dispatched", "arrived_at_station",
  "loading_in_progress", "loading_completed", "in_transit", "reconciliation_pending",
  "reconciled", "closed", "rejected", "cancelled", "expired_authorization",
  "meter_discrepancy", "failed_reconciliation",
]

export function Orders() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<{ items: OrderListItem[]; total: number } | null>(null)
  const [stations, setStations] = useState<StationListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newOrderOpen, setNewOrderOpen] = useState(false)

  const status = params.get("status") ?? ""
  const stationId = params.get("station_id") ?? ""
  const search = params.get("search") ?? ""
  const page = Number(params.get("page") ?? "1")
  const pageSize = 20

  useEffect(() => {
    getStations().then(setStations).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    getOrders({ status: status || undefined, station_id: stationId || undefined, search: search || undefined, page, page_size: pageSize })
      .then(setData)
      .finally(() => setLoading(false))
  }, [status, stationId, search, page])

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.set("page", "1")
    setParams(next)
  }

  function goToPage(p: number) {
    const next = new URLSearchParams(params)
    next.set("page", String(p))
    setParams(next)
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-(--app-text-muted)">
          {data ? `${formatNumber(data.total)} orders` : "Loading…"} across the full lifecycle, from submission to reconciliation.
        </p>
        <Button variant="primary" onClick={() => setNewOrderOpen(true)}>
          <Plus className="h-4 w-4" /> New Order
        </Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            placeholder="Search order number…"
            defaultValue={search}
            onKeyDown={(e) => e.key === "Enter" && updateFilter("search", (e.target as HTMLInputElement).value)}
            className="w-56 rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
            style={{ borderColor: "var(--app-border)" }}
          />
          <select
            value={status}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
            style={{ borderColor: "var(--app-border)" }}
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{prettyStatus(s)}</option>
            ))}
          </select>
          <select
            value={stationId}
            onChange={(e) => updateFilter("station_id", e.target.value)}
            className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
            style={{ borderColor: "var(--app-border)" }}
          >
            <option value="">All stations</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-(--app-text-muted)">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Station</th>
                <th className="px-4 py-2.5 font-medium">Product</th>
                <th className="px-4 py-2.5 font-medium">Qty (L)</th>
                <th className="px-4 py-2.5 font-medium">Tanker</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/orders/${o.id}`)}
                  className="cursor-pointer border-b last:border-0 hover:bg-black/[0.02]"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <td className="px-4 py-2.5 font-medium text-(--app-text)">{o.order_number}</td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{o.customer_name}</td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{o.station_name}</td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{prettyStatus(o.product)}</td>
                  <td className="px-4 py-2.5 tabular-nums text-(--app-text-muted)">{formatNumber(o.requested_quantity_l)}</td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{o.tanker_code ?? "—"}</td>
                  <td className="px-4 py-2.5"><StatusBadge tone={statusTone(o.status)} label={prettyStatus(o.status)} /></td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{formatDateTime(o.created_at)}</td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-(--app-text-muted)">No orders match these filters.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      {data && data.total > pageSize && (
        <div className="flex items-center justify-between text-sm text-(--app-text-muted)">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-1.5">
            <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="secondary" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <NewOrderModal
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        onCreated={(order) => navigate(`/orders/${order.id}`)}
      />
    </div>
  )
}

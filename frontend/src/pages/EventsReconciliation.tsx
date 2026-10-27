import { Fragment, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Loader2, ChevronDown, ChevronRight } from "lucide-react"
import { getOrders, getOrder, type OrderDetail } from "@/lib/api"
import { Card } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatNumber } from "@/lib/utils"

const RECONCILIATION_STATUSES = ["reconciliation_pending", "reconciled", "meter_discrepancy", "failed_reconciliation"]
const TOLERANCE_PCT = 2

function variance(order: OrderDetail): { label: string; pct: number | null; withinTolerance: boolean } {
  // Loading-phase exception: actual loaded vs authorized.
  if (order.status === "meter_discrepancy" && order.actual_loaded_quantity_l != null && order.authorized_quantity_l) {
    const pct = ((order.actual_loaded_quantity_l - order.authorized_quantity_l) / order.authorized_quantity_l) * 100
    return { label: "Loaded vs Authorized", pct, withinTolerance: Math.abs(pct) <= TOLERANCE_PCT }
  }
  // Reconciliation-phase: delivered vs loaded.
  if (order.delivery_quantity_l != null && order.actual_loaded_quantity_l) {
    const pct = ((order.delivery_quantity_l - order.actual_loaded_quantity_l) / order.actual_loaded_quantity_l) * 100
    return { label: "Delivered vs Loaded", pct, withinTolerance: Math.abs(pct) <= TOLERANCE_PCT }
  }
  return { label: "—", pct: null, withinTolerance: true }
}

function ToleranceBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-(--app-text-muted)">—</span>
  const clamped = Math.max(-10, Math.min(10, pct))
  const posPct = ((clamped + 10) / 20) * 100
  const within = Math.abs(pct) <= TOLERANCE_PCT
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-24 rounded-full bg-black/5">
        <div className="absolute inset-y-0 left-1/2 w-px bg-black/20" />
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full border-2 border-(--app-surface)"
          style={{ left: `${posPct}%`, background: within ? "var(--color-status-green)" : "var(--color-status-red)" }}
        />
      </div>
      <span className={`text-xs font-medium tabular-nums ${within ? "text-status-green" : "text-status-red"}`}>
        {pct > 0 ? "+" : ""}{pct.toFixed(2)}%
      </span>
    </div>
  )
}

export function EventsReconciliation() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderDetail[] | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all(RECONCILIATION_STATUSES.map((status) => getOrders({ status, page_size: 100 })))
      .then((responses) => Promise.all(responses.flatMap((r) => r.items.map((item) => getOrder(item.id)))))
      .then((details) => setOrders(details.sort((a, b) => (b.delivered_at ?? b.created_at).localeCompare(a.delivered_at ?? a.created_at))))
  }, [])

  if (!orders) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading reconciliation events…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--app-text-muted)">
        End-to-end event tracing for every order that has reached reconciliation — delivered volume is compared to the
        actual loaded volume (or, for a loading-stage exception, the loaded volume to the authorized quantity) against
        the ±{TOLERANCE_PCT}% tolerance band. Expand a row to trace its full lifecycle audit history.
      </p>

      <Card className="overflow-hidden p-0">
        {orders.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-(--app-text-muted)">No orders have reached reconciliation yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                <th className="px-4 py-2.5 font-medium"></th>
                <th className="px-4 py-2.5 font-medium">Order</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Requested</th>
                <th className="px-4 py-2.5 font-medium">Authorized</th>
                <th className="px-4 py-2.5 font-medium">Loaded</th>
                <th className="px-4 py-2.5 font-medium">Delivered</th>
                <th className="px-4 py-2.5 font-medium">Variance</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const v = variance(o)
                const expanded = expandedId === o.id
                return (
                  <Fragment key={o.id}>
                    <tr
                      className="cursor-pointer border-b hover:bg-black/[0.02]"
                      style={{ borderColor: "var(--app-border)" }}
                      onClick={() => setExpandedId(expanded ? null : o.id)}
                    >
                      <td className="px-4 py-2.5 text-(--app-text-muted)">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-(--app-text)">{o.order_number}</td>
                      <td className="px-4 py-2.5"><StatusBadge tone={statusTone(o.status)} label={prettyStatus(o.status)} /></td>
                      <td className="px-4 py-2.5 tabular-nums text-(--app-text-muted)">{formatNumber(o.requested_quantity_l)} L</td>
                      <td className="px-4 py-2.5 tabular-nums text-(--app-text-muted)">{o.authorized_quantity_l != null ? `${formatNumber(o.authorized_quantity_l)} L` : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-(--app-text-muted)">{o.actual_loaded_quantity_l != null ? `${formatNumber(o.actual_loaded_quantity_l)} L` : "—"}</td>
                      <td className="px-4 py-2.5 tabular-nums text-(--app-text-muted)">{o.delivery_quantity_l != null ? `${formatNumber(o.delivery_quantity_l)} L` : "—"}</td>
                      <td className="px-4 py-2.5"><ToleranceBar pct={v.pct} /></td>
                    </tr>
                    {expanded && (
                      <tr className="border-b" style={{ borderColor: "var(--app-border)" }}>
                        <td colSpan={8} className="bg-black/[0.015] px-4 py-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium text-(--app-text-muted)">
                              {v.label} — {v.pct != null ? `${v.pct > 0 ? "+" : ""}${v.pct.toFixed(2)}%` : "n/a"}
                              {o.exception_details && <span className="ml-2 text-status-red">· {o.exception_details}</span>}
                            </p>
                            <button className="text-xs text-teal-600 hover:underline" onClick={() => navigate(`/orders/${o.id}`)}>
                              Open order →
                            </button>
                          </div>
                          <ol className="mt-2 space-y-1.5">
                            {o.audit_history.map((entry) => (
                              <li key={entry.id} className="flex items-center justify-between text-xs">
                                <span className="text-(--app-text)">
                                  <span className="font-medium">{prettyStatus(entry.action)}</span>
                                  {entry.previous_state && entry.new_state && (
                                    <span className="text-(--app-text-muted)"> · {prettyStatus(entry.previous_state)} → {prettyStatus(entry.new_state)}</span>
                                  )}
                                  {entry.reason && <span className="text-(--app-text-muted)"> · {entry.reason}</span>}
                                </span>
                                <span className="text-(--app-text-muted)">{formatDateTime(entry.timestamp)}</span>
                              </li>
                            ))}
                          </ol>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

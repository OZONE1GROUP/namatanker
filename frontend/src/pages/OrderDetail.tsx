import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, Loader2 } from "lucide-react"
import {
  getOrder,
  getTankers,
  getDrivers,
  getStation,
  orderActions,
  ApiError,
  type OrderDetail as OrderDetailType,
  type TankerListItem,
  type DriverListItem,
  type LoadingBay,
  type OrderAction,
} from "@/lib/api"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { StatusBadge } from "@/components/ui/Badge"
import { Button } from "@/components/ui/Button"
import { Modal } from "@/components/ui/Modal"
import { statusTone, prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatNumber, formatOMR } from "@/lib/utils"
import { useAuthStore } from "@/lib/auth"

// Mirrors the backend's require_role(authorization_officer, admin) on
// POST /orders/{id}/authorize and /reject (app/routers/orders.py) — hiding
// these two buttons for other roles is pure UX; the backend still enforces
// this independently, so this list is a convenience, not the real guard.
const AUTHORIZER_ONLY_ACTIONS: OrderAction[] = ["authorize", "reject"]
const AUTHORIZER_ROLES = ["authorization_officer", "admin"]

const ACTION_LABELS: Record<OrderAction, string> = {
  assign: "Assign Tanker",
  authorize: "Authorize",
  reject: "Reject",
  expire_authorization: "Expire Authorization",
  dispatch: "Dispatch",
  arrive_at_station: "Arrive at Station",
  start_loading: "Start Loading",
  complete_loading: "Complete Loading",
  depart_station: "Depart Station",
  complete_delivery: "Complete Delivery",
  reconcile: "Reconcile",
  close: "Close Order",
  cancel: "Cancel Order",
}

const ACTION_DESCRIPTIONS: Partial<Record<OrderAction, string>> = {
  assign: "Pick a compatible idle tanker (and optionally a driver) for this order.",
  reject: "Reject the pending authorization. The order moves to Rejected.",
  cancel: "Cancel this order. Requires a reason, recorded in the audit trail.",
  start_loading: "Occupy a loading bay at the station and begin the simulated fill.",
  complete_loading: "Record the actual metered volume loaded into the tanker.",
  complete_delivery: "Record the delivered volume at the customer site.",
  authorize: "Issue a simulated authorization for the requested quantity.",
  reconcile: "Compare loaded vs delivered volume against the ±2% tolerance band.",
}

const MODAL_ACTIONS: OrderAction[] = ["assign", "reject", "cancel", "start_loading", "complete_loading", "complete_delivery"]
const DESTRUCTIVE_ACTIONS: OrderAction[] = ["reject", "cancel", "expire_authorization"]

const selectClass = "w-full rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-(--app-text-muted)">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-status-amber">{hint}</span>}
    </label>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-(--app-text-muted)">{label}</span>
      <span className="text-sm font-medium text-(--app-text)">{value ?? "—"}</span>
    </div>
  )
}

async function callSimpleAction(id: string, action: OrderAction) {
  switch (action) {
    case "authorize":
      return orderActions.authorize(id)
    case "expire_authorization":
      return orderActions.expireAuthorization(id)
    case "dispatch":
      return orderActions.dispatch(id)
    case "arrive_at_station":
      return orderActions.arriveAtStation(id)
    case "depart_station":
      return orderActions.departStation(id)
    case "reconcile":
      return orderActions.reconcile(id)
    case "close":
      return orderActions.close(id)
    default:
      throw new Error(`${action} requires input`)
  }
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderDetailType | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<OrderAction | null>(null)
  const [modalAction, setModalAction] = useState<OrderAction | null>(null)
  const role = useAuthStore((s) => s.user?.role)
  const canAuthorize = !!role && AUTHORIZER_ROLES.includes(role)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setNotFound(false)
    getOrder(id)
      .then(setOrder)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [id])

  async function runSimpleAction(action: OrderAction) {
    if (!order) return
    setBusyAction(action)
    setActionError(null)
    try {
      const res = await callSimpleAction(order.id, action)
      setOrder(res.order)
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : "Action failed")
    } finally {
      setBusyAction(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-(--app-text-muted)">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading order…
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="space-y-4">
        <BackLink navigate={navigate} />
        <Card className="p-8 text-center text-(--app-text-muted)">Order not found.</Card>
      </div>
    )
  }

  const visibleActions = canAuthorize
    ? order.available_actions
    : order.available_actions.filter((a) => !AUTHORIZER_ONLY_ACTIONS.includes(a))
  const hiddenAuthorizerActions = canAuthorize
    ? []
    : order.available_actions.filter((a) => AUTHORIZER_ONLY_ACTIONS.includes(a))

  return (
    <div className="space-y-4">
      <BackLink navigate={navigate} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-(--app-text)">{order.order_number}</h2>
            <StatusBadge tone={statusTone(order.status)} label={prettyStatus(order.status)} />
          </div>
          <p className="mt-0.5 text-sm text-(--app-text-muted)">
            {prettyStatus(order.product)} · {order.customer_name} · {order.station_name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {visibleActions.map((action) => (
            <Button
              key={action}
              variant={DESTRUCTIVE_ACTIONS.includes(action) ? "destructive" : "primary"}
              loading={busyAction === action}
              onClick={() => (MODAL_ACTIONS.includes(action) ? setModalAction(action) : runSimpleAction(action))}
            >
              {ACTION_LABELS[action]}
            </Button>
          ))}
          {order.available_actions.length === 0 && (
            <span className="rounded-lg border px-3 py-2 text-xs text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
              No further actions — terminal state
            </span>
          )}
          {hiddenAuthorizerActions.length > 0 && (
            <span className="text-xs text-(--app-text-muted)">
              {hiddenAuthorizerActions.map((a) => ACTION_LABELS[a]).join(" / ")} requires the Authorization Officer or Admin role.
            </span>
          )}
        </div>
      </div>

      {actionError && (
        <Card className="border-status-red p-3 text-sm text-status-red">{actionError}</Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Order Details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <div>
                <InfoRow label="Customer" value={order.customer_name} />
                <InfoRow label="Station" value={order.station_name} />
                <InfoRow label="Product" value={prettyStatus(order.product)} />
                <InfoRow label="Requested quantity" value={`${formatNumber(order.requested_quantity_l)} L`} />
                <InfoRow label="Authorized quantity" value={order.authorized_quantity_l != null ? `${formatNumber(order.authorized_quantity_l)} L` : null} />
              </div>
              <div>
                <InfoRow label="Tanker" value={order.tanker_code} />
                <InfoRow label="Driver" value={order.driver_name} />
                <InfoRow label="Loading bay" value={order.loading_bay_code} />
                <InfoRow label="Actual loaded" value={order.actual_loaded_quantity_l != null ? `${formatNumber(order.actual_loaded_quantity_l)} L` : null} />
                <InfoRow label="Delivered" value={order.delivery_quantity_l != null ? `${formatNumber(order.delivery_quantity_l)} L` : null} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Order Value</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              <div>
                <InfoRow label="Price per liter" value={order.price_per_liter != null ? formatOMR(order.price_per_liter) : "Not defined"} />
                <InfoRow label="Order value" value={order.order_value != null ? formatOMR(order.order_value) : "Not defined"} />
              </div>
              {order.order_value == null && (
                <p className="self-center text-xs text-status-amber sm:col-span-1">
                  No price per liter is configured for {prettyStatus(order.product)} yet — set it under
                  Administration &amp; Settings → Pricing &amp; Commission Settings.
                </p>
              )}
            </CardContent>
          </Card>

          {order.exception_details && (
            <Card className="border-status-red">
              <CardHeader><CardTitle className="text-status-red">Exception</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-(--app-text)">{order.exception_details}</p></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Lifecycle Timeline</CardTitle></CardHeader>
            <CardContent>
              {order.audit_history.length === 0 ? (
                <p className="text-sm text-(--app-text-muted)">No audit entries yet.</p>
              ) : (
                <ol className="space-y-3">
                  {order.audit_history.map((entry) => (
                    <li key={entry.id} className="flex gap-3 text-sm">
                      <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />
                      <div className="flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-(--app-text)">{prettyStatus(entry.action)}</span>
                          <span className="text-xs text-(--app-text-muted)">{formatDateTime(entry.timestamp)}</span>
                        </div>
                        <p className="text-xs text-(--app-text-muted)">
                          {entry.previous_state && entry.new_state
                            ? `${prettyStatus(entry.previous_state)} → ${prettyStatus(entry.new_state)}`
                            : entry.new_state
                              ? `→ ${prettyStatus(entry.new_state)}`
                              : null}
                          {entry.reason ? ` · ${entry.reason}` : ""}
                          {` · ${entry.actor}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Authorization</CardTitle></CardHeader>
            <CardContent>
              {order.authorization ? (
                <>
                  <InfoRow label="Status" value={<StatusBadge tone={statusTone(order.authorization.status)} label={prettyStatus(order.authorization.status)} />} />
                  <InfoRow label="Max quantity" value={`${formatNumber(order.authorization.max_authorized_quantity_l)} L`} />
                  <InfoRow label="Issuing service" value={order.authorization.issuing_service} />
                  <InfoRow label="Issued" value={formatDateTime(order.authorization.issued_at)} />
                  <InfoRow label="Expires" value={formatDateTime(order.authorization.expires_at)} />
                  {order.authorization.verification_result && (
                    <InfoRow label="Verification" value={order.authorization.verification_result} />
                  )}
                </>
              ) : (
                <p className="text-sm text-(--app-text-muted)">No authorization issued yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Key Timestamps</CardTitle></CardHeader>
            <CardContent>
              <InfoRow label="Created" value={formatDateTime(order.created_at)} />
              <InfoRow label="Authorized" value={order.authorized_at ? formatDateTime(order.authorized_at) : null} />
              <InfoRow label="Loaded" value={order.loaded_at ? formatDateTime(order.loaded_at) : null} />
              <InfoRow label="Delivered" value={order.delivered_at ? formatDateTime(order.delivered_at) : null} />
            </CardContent>
          </Card>
        </div>
      </div>

      {modalAction && (
        <ActionFormModal
          action={modalAction}
          order={order}
          onClose={() => setModalAction(null)}
          onDone={(updated) => setOrder(updated)}
        />
      )}
    </div>
  )
}

function BackLink({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <button
      onClick={() => navigate("/orders")}
      className="inline-flex items-center gap-1.5 text-sm text-(--app-text-muted) hover:text-(--app-text)"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Back to Orders
    </button>
  )
}

function ActionFormModal({
  action,
  order,
  onClose,
  onDone,
}: {
  action: OrderAction
  order: OrderDetailType
  onClose: () => void
  onDone: (order: OrderDetailType) => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tankers, setTankers] = useState<TankerListItem[]>([])
  const [drivers, setDrivers] = useState<DriverListItem[]>([])
  const [bays, setBays] = useState<LoadingBay[]>([])
  const [tankerId, setTankerId] = useState("")
  const [driverId, setDriverId] = useState("")
  const [bayId, setBayId] = useState("")
  const [reason, setReason] = useState("")
  const [quantity, setQuantity] = useState(
    action === "complete_loading"
      ? order.authorized_quantity_l ?? order.requested_quantity_l
      : order.actual_loaded_quantity_l ?? order.requested_quantity_l
  )

  useEffect(() => {
    if (action === "assign") {
      getTankers().then((list) => {
        setTankers(list)
        const idle = list.find((t) => t.status === "idle" && t.assigned_product === order.product)
        if (idle) setTankerId(idle.id)
      })
      getDrivers().then(setDrivers)
    }
    if (action === "start_loading") {
      getStation(order.station_id).then((s) => setBays(s.loading_bays.filter((b) => b.status === "idle")))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      let res
      switch (action) {
        case "assign":
          if (!tankerId) throw new Error("Select a tanker")
          res = await orderActions.assign(order.id, tankerId, driverId || null)
          break
        case "reject":
          if (!reason.trim()) throw new Error("A reason is required")
          res = await orderActions.reject(order.id, reason.trim())
          break
        case "cancel":
          if (!reason.trim()) throw new Error("A reason is required")
          res = await orderActions.cancel(order.id, reason.trim())
          break
        case "start_loading":
          if (!bayId) throw new Error("Select a loading bay")
          res = await orderActions.startLoading(order.id, bayId)
          break
        case "complete_loading":
          if (quantity <= 0) throw new Error("Enter the loaded quantity")
          res = await orderActions.completeLoading(order.id, quantity)
          break
        case "complete_delivery":
          if (quantity <= 0) throw new Error("Enter the delivered quantity")
          res = await orderActions.completeDelivery(order.id, quantity)
          break
        default:
          throw new Error("Unsupported action")
      }
      onDone(res.order)
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Action failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={ACTION_LABELS[action]} description={ACTION_DESCRIPTIONS[action]}>
      <div className="space-y-3">
        {action === "assign" && (
          <>
            <Field label="Tanker" hint={tankers.length === 0 ? "Loading tankers…" : "A tanker with expired KYC (registration/insurance) cannot be assigned."}>
              <select value={tankerId} onChange={(e) => setTankerId(e.target.value)} className={selectClass}>
                <option value="">Select tanker…</option>
                {tankers.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.status !== "idle" || t.kyc_status === "expired"}>
                    {t.tanker_code} — {prettyStatus(t.assigned_product)} ({prettyStatus(t.status)})
                    {t.kyc_status === "expired" ? " — KYC EXPIRED" : t.kyc_status === "expiring_soon" ? " — KYC expiring soon" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Driver (optional)" hint="A driver with expired KYC (license/civil ID) cannot be assigned.">
              <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={selectClass}>
                <option value="">Auto / none</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.kyc.overall_status === "expired"}>
                    {d.display_name} ({prettyStatus(d.duty_status)})
                    {d.kyc.overall_status === "expired" ? " — KYC EXPIRED" : d.kyc.overall_status === "expiring_soon" ? " — KYC expiring soon" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {(action === "reject" || action === "cancel") && (
          <Field label="Reason">
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={selectClass} />
          </Field>
        )}

        {action === "start_loading" && (
          <Field label="Loading bay" hint={bays.length === 0 ? "No idle bays at this station right now." : undefined}>
            <select value={bayId} onChange={(e) => setBayId(e.target.value)} className={selectClass}>
              <option value="">Select bay…</option>
              {bays.map((b) => <option key={b.id} value={b.id}>{b.bay_code}</option>)}
            </select>
          </Field>
        )}

        {(action === "complete_loading" || action === "complete_delivery") && (
          <Field label={action === "complete_loading" ? "Actual loaded quantity (L)" : "Delivered quantity (L)"}>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className={selectClass}
            />
          </Field>
        )}

        {error && <p className="text-xs text-status-red">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant={action === "reject" || action === "cancel" ? "destructive" : "primary"}
            loading={submitting}
            onClick={submit}
          >
            {ACTION_LABELS[action]}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

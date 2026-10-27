import { useEffect, useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { Button } from "@/components/ui/Button"
import { createOrder, getCustomers, getStations, type Customer, type OrderDetail, type StationListItem } from "@/lib/api"
import { ApiError } from "@/lib/api"

const PRODUCTS = [
  { value: "diesel", label: "Diesel" },
  { value: "petrol_91", label: "Petrol 91" },
  { value: "petrol_95", label: "Petrol 95" },
  { value: "jet_fuel", label: "Jet Fuel" },
  { value: "lpg", label: "LPG" },
]

export function NewOrderModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (order: OrderDetail) => void
}) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [stations, setStations] = useState<StationListItem[]>([])
  const [customerId, setCustomerId] = useState("")
  const [stationId, setStationId] = useState("")
  const [product, setProduct] = useState("diesel")
  const [quantity, setQuantity] = useState(12000)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    getCustomers().then((c) => {
      setCustomers(c)
      if (!customerId && c.length) setCustomerId(c[0].id)
    })
    getStations().then((s) => {
      setStations(s)
      if (!stationId && s.length) setStationId(s[0].id)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const order = await createOrder({
        customer_id: customerId,
        station_id: stationId,
        product,
        requested_quantity_l: quantity,
      })
      onOpenChange(false)
      onCreated(order)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create order")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New Order" description="Creates an order in Submitted status, ready to assign a tanker.">
      <div className="space-y-3">
        <Field label="Customer">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={selectClass}>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Station">
          <select value={stationId} onChange={(e) => setStationId(e.target.value)} className={selectClass}>
            {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Product">
          <select value={product} onChange={(e) => setProduct(e.target.value)} className={selectClass}>
            {PRODUCTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Requested quantity (L)">
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className={selectClass}
          />
        </Field>

        {error && <p className="text-xs text-status-red">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={submitting} onClick={submit} disabled={!customerId || !stationId || quantity <= 0}>
            Create Order
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const selectClass = "w-full rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-(--app-text-muted)">{label}</span>
      {children}
    </label>
  )
}

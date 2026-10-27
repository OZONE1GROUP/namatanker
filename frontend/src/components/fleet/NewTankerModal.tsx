import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { Button } from "@/components/ui/Button"
import { createTanker, type TankerDetail } from "@/lib/api"
import { ApiError } from "@/lib/api"

const PRODUCTS = [
  { value: "diesel", label: "Diesel" },
  { value: "petrol_91", label: "Petrol 91" },
  { value: "petrol_95", label: "Petrol 95" },
  { value: "jet_fuel", label: "Jet Fuel" },
  { value: "lpg", label: "LPG" },
]

function defaultExpiry(yearsFromNow: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() + yearsFromNow)
  return d.toISOString().slice(0, 10)
}

export function NewTankerModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (tanker: TankerDetail) => void
}) {
  const [registrationNumber, setRegistrationNumber] = useState("")
  const [registrationExpiry, setRegistrationExpiry] = useState(defaultExpiry(1))
  const [insuranceNumber, setInsuranceNumber] = useState("")
  const [insuranceExpiry, setInsuranceExpiry] = useState(defaultExpiry(1))
  const [capacity, setCapacity] = useState(25000)
  const [product, setProduct] = useState("diesel")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = registrationNumber.trim() && insuranceNumber.trim() && registrationExpiry && insuranceExpiry && capacity > 0

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const tanker = await createTanker({
        registration_number: registrationNumber.trim(),
        registration_expiry: registrationExpiry,
        insurance_number: insuranceNumber.trim(),
        insurance_expiry: insuranceExpiry,
        capacity_l: capacity,
        assigned_product: product,
      })
      onOpenChange(false)
      setRegistrationNumber("")
      setInsuranceNumber("")
      onCreated(tanker)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to register vehicle")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New Tanker"
      description="Registers a vehicle with its KYC documents (registration/Istimara + insurance). SIMULATION MODE: synthetic demo document numbers, not verified against any real registry or insurer."
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Registration (Istimara) no.">
            <input value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} className={inputClass} placeholder="e.g. OM-48213" />
          </Field>
          <Field label="Registration expiry">
            <input type="date" value={registrationExpiry} onChange={(e) => setRegistrationExpiry(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Insurance number">
            <input value={insuranceNumber} onChange={(e) => setInsuranceNumber(e.target.value)} className={inputClass} placeholder="e.g. INS-772104" />
          </Field>
          <Field label="Insurance expiry">
            <input type="date" value={insuranceExpiry} onChange={(e) => setInsuranceExpiry(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capacity (L)">
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className={inputClass} />
          </Field>
          <Field label="Product">
            <select value={product} onChange={(e) => setProduct(e.target.value)} className={inputClass}>
              {PRODUCTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
        </div>

        {error && <p className="text-xs text-status-red">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={submitting} onClick={submit} disabled={!valid}>
            Register Vehicle
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const inputClass = "w-full rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-(--app-text-muted)">{label}</span>
      {children}
    </label>
  )
}

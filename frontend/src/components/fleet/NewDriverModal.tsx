import { useState } from "react"
import { Modal } from "@/components/ui/Modal"
import { Button } from "@/components/ui/Button"
import { createDriver, type DriverListItem } from "@/lib/api"
import { ApiError } from "@/lib/api"

function defaultExpiry(yearsFromNow: number) {
  const d = new Date()
  d.setFullYear(d.getFullYear() + yearsFromNow)
  return d.toISOString().slice(0, 10)
}

export function NewDriverModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (driver: DriverListItem) => void
}) {
  const [displayName, setDisplayName] = useState("")
  const [civilIdNumber, setCivilIdNumber] = useState("")
  const [civilIdExpiry, setCivilIdExpiry] = useState(defaultExpiry(2))
  const [licenseNumber, setLicenseNumber] = useState("")
  const [licenseExpiry, setLicenseExpiry] = useState(defaultExpiry(3))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = displayName.trim() && civilIdNumber.trim() && licenseNumber.trim() && civilIdExpiry && licenseExpiry

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const driver = await createDriver({
        display_name: displayName.trim(),
        civil_id_number: civilIdNumber.trim(),
        civil_id_expiry: civilIdExpiry,
        license_number: licenseNumber.trim(),
        license_expiry: licenseExpiry,
      })
      onOpenChange(false)
      setDisplayName("")
      setCivilIdNumber("")
      setLicenseNumber("")
      onCreated(driver)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to register driver")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New Driver"
      description="Registers a driver with their KYC documents (license + civil ID). SIMULATION MODE: synthetic demo document numbers, not verified against any real registry."
    >
      <div className="space-y-3">
        <Field label="Full name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} placeholder="e.g. Said Al-Harthy" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Civil ID number">
            <input value={civilIdNumber} onChange={(e) => setCivilIdNumber(e.target.value)} className={inputClass} placeholder="e.g. 10234567" />
          </Field>
          <Field label="Civil ID expiry">
            <input type="date" value={civilIdExpiry} onChange={(e) => setCivilIdExpiry(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="License number">
            <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={inputClass} placeholder="e.g. DL-204981" />
          </Field>
          <Field label="License expiry">
            <input type="date" value={licenseExpiry} onChange={(e) => setLicenseExpiry(e.target.value)} className={inputClass} />
          </Field>
        </div>

        {error && <p className="text-xs text-status-red">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" loading={submitting} onClick={submit} disabled={!valid}>
            Register Driver
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

import type { StatusTone } from "@/components/ui/Badge"

export function prettyStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const TONE_MAP: Record<string, StatusTone> = {
  draft: "grey",
  submitted: "grey",
  validated: "blue",
  awaiting_authorization: "amber",
  authorized: "blue",
  dispatched: "blue",
  arrived_at_station: "blue",
  loading_initiated: "blue",
  loading_in_progress: "blue",
  loading_completed: "blue",
  in_transit: "blue",
  delivery_completed: "green",
  reconciliation_pending: "amber",
  reconciled: "green",
  closed: "green",
  rejected: "red",
  cancelled: "grey",
  expired_authorization: "red",
  loading_interrupted: "red",
  meter_discrepancy: "red",
  failed_reconciliation: "red",
  // Tanker statuses
  idle: "grey",
  maintenance: "amber",
  offline: "red",
  returning: "blue",
  loading: "blue",
  at_station: "blue",
  delivering: "blue",
  // Connectivity / bay statuses
  online: "green",
  degraded: "amber",
  occupied: "blue",
  // Alert / authorization statuses
  open: "red",
  acknowledged: "amber",
  resolved: "green",
  escalated: "red",
  valid: "green",
  expired: "red",
  revoked: "red",
  // Phase 9 — KYC document validity
  expiring_soon: "amber",
  missing: "grey",
  info: "blue",
  warning: "amber",
  critical: "red",
  // Driver duty status
  off_duty: "grey",
  on_duty: "green",
  driving: "blue",
  on_break: "amber",
  // Driver qualification (stored as display strings, not enum keys)
  Certified: "green",
  "Renewal Due": "amber",
}

export function statusTone(status: string): StatusTone {
  return TONE_MAP[status] ?? "grey"
}

/** Mirrors backend ROLE_LABELS in app/routers/auth.py — keep in sync. */
export const ROLE_LABELS: Record<string, string> = {
  operator: "Terminal Operator",
  authorization_officer: "Authorization Officer",
  fleet_manager: "Fleet & Stations Manager",
  auditor: "Compliance Auditor",
  admin: "System Administrator",
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

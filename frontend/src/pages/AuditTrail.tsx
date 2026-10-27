import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react"
import { getAudit, type AuditListItem } from "@/lib/api"
import { Card } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"
import { prettyStatus } from "@/lib/orderStatus"
import { formatDateTime, formatNumber } from "@/lib/utils"

const ENTITY_TYPES = ["order", "authorization", "tanker", "driver", "station"]

export function AuditTrail() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<{ items: AuditListItem[]; total: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const entityType = params.get("entity_type") ?? ""
  const page = Number(params.get("page") ?? "1")
  const pageSize = 50

  useEffect(() => {
    setLoading(true)
    getAudit({ entity_type: entityType || undefined, page, page_size: pageSize })
      .then(setData)
      .finally(() => setLoading(false))
  }, [entityType, page])

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
          {data ? `${formatNumber(data.total)} entries` : "Loading…"} in the append-only audit log — every state transition, system and user action.
        </p>
      </div>

      <Card className="p-3">
        <select
          value={entityType}
          onChange={(e) => updateFilter("entity_type", e.target.value)}
          className="rounded-lg border bg-(--app-surface) px-3 py-1.5 text-sm text-(--app-text)"
          style={{ borderColor: "var(--app-border)" }}
        >
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{prettyStatus(t)}</option>
          ))}
        </select>
      </Card>

      <Card className="overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-(--app-text-muted)">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading audit log…
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-(--app-text-muted)" style={{ borderColor: "var(--app-border)" }}>
                <th className="px-4 py-2.5 font-medium">Timestamp</th>
                <th className="px-4 py-2.5 font-medium">Entity</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Transition</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((entry) => (
                <tr
                  key={entry.id}
                  className={entry.entity_type === "order" ? "cursor-pointer border-b last:border-0 hover:bg-black/[0.02]" : "border-b last:border-0"}
                  style={{ borderColor: "var(--app-border)" }}
                  onClick={() => entry.entity_type === "order" && navigate(`/orders/${entry.entity_id}`)}
                >
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{formatDateTime(entry.timestamp)}</td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{prettyStatus(entry.entity_type)}</td>
                  <td className="px-4 py-2.5 font-medium text-(--app-text)">{prettyStatus(entry.action)}</td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">
                    {entry.previous_state && entry.new_state
                      ? `${prettyStatus(entry.previous_state)} → ${prettyStatus(entry.new_state)}`
                      : entry.new_state
                        ? `→ ${prettyStatus(entry.new_state)}`
                        : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{entry.actor}</td>
                  <td className="px-4 py-2.5 text-(--app-text-muted)">{entry.reason ?? "—"}</td>
                </tr>
              ))}
              {data?.items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-(--app-text-muted)">No audit entries match this filter.</td></tr>
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
    </div>
  )
}

import type { LucideIcon } from "lucide-react"
import { Card } from "./Card"
import { cn } from "@/lib/utils"

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "blue",
  onClick,
  sublabel,
}: {
  label: string
  value: string
  icon: LucideIcon
  tone?: "blue" | "teal" | "amber" | "red" | "green" | "grey"
  onClick?: () => void
  sublabel?: string
}) {
  const toneClasses: Record<string, string> = {
    blue: "bg-status-blue-bg text-status-blue",
    teal: "bg-teal-500/10 text-teal-500",
    amber: "bg-status-amber-bg text-status-amber",
    red: "bg-status-red-bg text-status-red",
    green: "bg-status-green-bg text-status-green",
    grey: "bg-status-grey-bg text-status-grey",
  }

  return (
    <Card onClick={onClick} className="p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-(--app-text-muted)">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-(--app-text)">
            {value}
          </p>
          {sublabel && (
            <p className="mt-0.5 text-xs text-(--app-text-muted)">{sublabel}</p>
          )}
        </div>
        <div className={cn("shrink-0 rounded-lg p-2", toneClasses[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  )
}

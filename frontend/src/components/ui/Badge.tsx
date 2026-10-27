import { cn } from "@/lib/utils"

export type StatusTone = "green" | "blue" | "amber" | "red" | "grey" | "purple"

const toneClasses: Record<StatusTone, string> = {
  green: "bg-status-green-bg text-status-green",
  blue: "bg-status-blue-bg text-status-blue",
  amber: "bg-status-amber-bg text-status-amber",
  red: "bg-status-red-bg text-status-red",
  grey: "bg-status-grey-bg text-status-grey",
  purple: "bg-status-purple-bg text-status-purple",
}

const dotClasses: Record<StatusTone, string> = {
  green: "bg-status-green",
  blue: "bg-status-blue",
  amber: "bg-status-amber",
  red: "bg-status-red",
  grey: "bg-status-grey",
  purple: "bg-status-purple",
}

export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])} />
      {label}
    </span>
  )
}

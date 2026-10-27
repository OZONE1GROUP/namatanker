import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-(--app-surface) shadow-sm",
        onClick && "cursor-pointer transition hover:shadow-md hover:-translate-y-0.5",
        className
      )}
      style={{ borderColor: "var(--app-border)" }}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between px-5 pt-5", className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-semibold text-(--app-text)", className)}>{children}</h3>
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>
}

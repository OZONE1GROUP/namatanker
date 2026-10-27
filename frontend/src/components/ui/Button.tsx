import type { ButtonHTMLAttributes } from "react"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "destructive" | "ghost"

const variantClasses: Record<Variant, string> = {
  primary: "bg-teal-500 text-white hover:brightness-110",
  secondary: "border bg-(--app-surface) text-(--app-text) hover:bg-black/5",
  destructive: "bg-status-red text-white hover:brightness-110",
  ghost: "text-(--app-text-muted) hover:bg-black/5",
}

export function Button({
  variant = "secondary",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variantClasses[variant],
        className
      )}
      style={variant === "secondary" ? { borderColor: "var(--app-border)" } : undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  )
}

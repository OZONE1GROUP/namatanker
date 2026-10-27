import { useLocation } from "react-router-dom"
import { Construction } from "lucide-react"
import { NAV_ITEMS } from "@/config/navigation"
import { Card } from "@/components/ui/Card"

export function PlaceholderPage() {
  const location = useLocation()
  const item = NAV_ITEMS.find((n) => n.path === location.pathname)

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-24 text-center">
      <div className="mb-4 rounded-full bg-status-blue-bg p-3">
        <Construction className="h-6 w-6 text-status-blue" />
      </div>
      <h2 className="text-lg font-semibold text-(--app-text)">{item?.label ?? "Module"}</h2>
      <p className="mt-1.5 max-w-md text-sm text-(--app-text-muted)">{item?.description}</p>
      <Card className="mt-6 w-full p-4 text-left">
        <p className="text-sm text-(--app-text)">
          Scheduled for <span className="font-semibold">Phase {item?.phase}</span> of the implementation plan.
        </p>
        <p className="mt-1 text-xs text-(--app-text-muted)">
          Navigation is wired now so the full information architecture is in place; this screen's working
          functionality — tables, drill-downs and controls — lands when its phase is built.
        </p>
      </Card>
    </div>
  )
}

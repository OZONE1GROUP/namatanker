import { Link } from "react-router-dom"
import { Compass } from "lucide-react"
import { Card } from "@/components/ui/Card"

export function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-24 text-center">
      <div className="mb-4 rounded-full bg-status-grey-bg p-3">
        <Compass className="h-6 w-6 text-status-grey" />
      </div>
      <h2 className="text-lg font-semibold text-(--app-text)">Page not found</h2>
      <p className="mt-1.5 max-w-md text-sm text-(--app-text-muted)">
        There's no screen at this address. It may have been renamed, or the link may be out of date.
      </p>
      <Card className="mt-6 w-full p-4">
        <Link to="/" className="text-sm font-medium text-teal-500 hover:underline">
          ← Back to Executive Overview
        </Link>
      </Card>
    </div>
  )
}

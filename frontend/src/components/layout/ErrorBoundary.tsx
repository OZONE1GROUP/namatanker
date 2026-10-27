import { Component, type ReactNode } from "react"
import { AlertOctagon } from "lucide-react"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Phase 7 polish — catches a render-time crash in any routed page so one
 * broken screen doesn't blank the whole app. Resetting is a full reload
 * rather than clearing local state, since the error may have come from
 * stale/partial data that a soft reset wouldn't fix anyway.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("Unhandled error in routed page:", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto flex max-w-lg flex-col items-center py-24 text-center">
          <div className="mb-4 rounded-full bg-status-red-bg p-3">
            <AlertOctagon className="h-6 w-6 text-status-red" />
          </div>
          <h2 className="text-lg font-semibold text-(--app-text)">Something went wrong on this screen</h2>
          <p className="mt-1.5 max-w-md text-sm text-(--app-text-muted)">
            {this.state.error.message || "An unexpected error occurred while rendering this page."}
          </p>
          <button
            onClick={() => window.location.assign("/")}
            className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--color-teal-500)" }}
          >
            Back to Executive Overview
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

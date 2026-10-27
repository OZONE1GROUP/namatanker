import { Outlet, useLocation } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"
import { ErrorBoundary } from "./ErrorBoundary"

export function AppShell() {
  const location = useLocation()
  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "var(--app-bg)" }}>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          {/* Keyed by path so navigating away from a crashed page remounts
              a fresh boundary instead of staying stuck on the error screen. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

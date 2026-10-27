import { useEffect, useState } from "react"
import { Navigate, useLocation, useNavigate } from "react-router-dom"
import { ShieldCheck, Loader2, LogIn } from "lucide-react"
import { useAuthStore } from "@/lib/auth"
import { getDemoUsers, type DemoUser } from "@/lib/auth"

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = useAuthStore((s) => s.token)
  const status = useAuthStore((s) => s.status)
  const error = useAuthStore((s) => s.error)
  const login = useAuthStore((s) => s.login)

  const [demoUsers, setDemoUsers] = useState<DemoUser[] | null>(null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [pendingRole, setPendingRole] = useState<string | null>(null)

  useEffect(() => {
    getDemoUsers().then(setDemoUsers).catch(() => setDemoUsers([]))
  }, [])

  if (token) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/"
    return <Navigate to={redirectTo} replace />
  }

  async function doLogin(u: string, p: string, roleKey?: string) {
    setPendingRole(roleKey ?? null)
    try {
      await login(u, p)
      navigate("/", { replace: true })
    } catch {
      // error is already surfaced via the store's `error` field
    } finally {
      setPendingRole(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--app-bg)" }}>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border shadow-lg" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Brand panel */}
          <div
            className="flex flex-col justify-between p-8 text-white"
            style={{ background: "linear-gradient(135deg, var(--color-navy-900), var(--color-slate-800))" }}
          >
            <div>
              <p className="text-lg font-semibold tracking-tight">OmanOne.tech</p>
              <p className="text-sm text-white/70">Integrated Digital Tanker Operations Simulator</p>
            </div>
            <div className="space-y-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold tracking-wide text-amber-300">
                SIMULATION MODE
              </span>
              <p className="text-sm text-white/70">
                Every order, tanker, meter reading and alert in this environment is synthetic. Nothing here ever
                connects to real PLCs, meters, GPS devices, or industrial equipment.
              </p>
              <div className="flex items-start gap-2 text-xs text-white/60">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Phase 7 demo accounts below demonstrate role-based access control — each role is permitted a different slice of the workflow.</span>
              </div>
            </div>
          </div>

          {/* Login panel */}
          <div className="p-8">
            <h2 className="text-lg font-semibold text-(--app-text)">Sign in</h2>
            <p className="mt-1 text-sm text-(--app-text-muted)">Choose a demo role for one-click access, or sign in manually.</p>

            <div className="mt-4 space-y-2">
              {demoUsers === null ? (
                <div className="flex items-center gap-2 py-6 text-sm text-(--app-text-muted)">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading demo accounts…
                </div>
              ) : (
                demoUsers.map((d) => (
                  <button
                    key={d.username}
                    onClick={() => doLogin(d.username, d.password, d.username)}
                    disabled={status === "loading"}
                    className="flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left hover:bg-black/[0.03] disabled:opacity-60"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-(--app-text)">{d.role_label}</p>
                      <p className="truncate text-xs text-(--app-text-muted)">{d.display_name} · {d.description}</p>
                    </div>
                    {pendingRole === d.username ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-(--app-text-muted)" />
                    ) : (
                      <LogIn className="h-4 w-4 shrink-0 text-(--app-text-muted)" />
                    )}
                  </button>
                ))
              )}
            </div>

            <div className="my-5 flex items-center gap-3 text-xs text-(--app-text-muted)">
              <div className="h-px flex-1" style={{ background: "var(--app-border)" }} />
              or sign in manually
              <div className="h-px flex-1" style={{ background: "var(--app-border)" }} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                doLogin(username, password)
              }}
              className="space-y-3"
            >
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username (e.g. operator1)"
                className="w-full rounded-lg border bg-(--app-surface) px-3 py-2 text-sm text-(--app-text) placeholder:text-(--app-text-muted)"
                style={{ borderColor: "var(--app-border)" }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (demo123)"
                className="w-full rounded-lg border bg-(--app-surface) px-3 py-2 text-sm text-(--app-text) placeholder:text-(--app-text-muted)"
                style={{ borderColor: "var(--app-border)" }}
              />
              {error && <p className="text-xs font-medium text-status-red">{error}</p>}
              <button
                type="submit"
                disabled={status === "loading" || !username || !password}
                className="w-full rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--color-teal-500)" }}
              >
                {status === "loading" && !pendingRole ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

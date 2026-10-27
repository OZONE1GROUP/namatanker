import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuthStore } from "@/lib/auth"

/** Phase 7 route guard — redirects to /login if there's no demo session, remembering where to return to. */
export function RequireAuth() {
  const token = useAuthStore((s) => s.token)
  const location = useLocation()

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return <Outlet />
}

/**
 * Phase 7 — demo authentication store. SIMULATION MODE: backs onto the
 * backend's seeded demo accounts (see backend/app/seed.py); there is no
 * real identity provider behind this, by design, for this simulator.
 *
 * Token + user are kept in both the Zustand store (for React components)
 * and localStorage (so a refresh doesn't force a re-login). api.ts reads
 * the token via getAuthToken() for every request and calls
 * handleUnauthorized() on a 401 — both defined here to avoid a circular
 * subscription setup.
 */
import { create } from "zustand"
import { api, ApiError } from "./api"

export interface AuthUser {
  id: string
  username: string
  display_name: string
  role: string
}

export interface DemoUser {
  username: string
  password: string
  display_name: string
  role: string
  role_label: string
  description: string
}

interface LoginResponse {
  access_token: string
  token_type: string
  expires_in_minutes: number
  user: AuthUser
}

const STORAGE_KEY = "omanone.auth"

function loadStored(): { token: string | null; user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { token: null, user: null }
    const parsed = JSON.parse(raw)
    return { token: parsed.token ?? null, user: parsed.user ?? null }
  } catch {
    return { token: null, user: null }
  }
}

function persist(token: string | null, user: AuthUser | null) {
  try {
    if (token && user) localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // per-viewer convenience only — a failed write just means a re-login after refresh
  }
}

interface AuthState {
  token: string | null
  user: AuthUser | null
  status: "idle" | "loading" | "error"
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const initial = loadStored()

export const useAuthStore = create<AuthState>((set) => ({
  token: initial.token,
  user: initial.user,
  status: "idle",
  error: null,
  async login(username, password) {
    set({ status: "loading", error: null })
    try {
      const res = await api.post<LoginResponse>("/auth/login", { username, password })
      persist(res.access_token, res.user)
      set({ token: res.access_token, user: res.user, status: "idle", error: null })
    } catch (e) {
      const message = e instanceof ApiError && e.status === 401
        ? "Incorrect username or password."
        : "Could not reach the simulator backend. Is it running?"
      set({ status: "error", error: message })
      throw e
    }
  },
  logout() {
    persist(null, null)
    set({ token: null, user: null, status: "idle", error: null })
  },
}))

export function getAuthToken(): string | null {
  return useAuthStore.getState().token
}

export function handleUnauthorized() {
  // Only act if we thought we were logged in — avoids loop-y state churn
  // on the login page itself, where a 401 is just "wrong password".
  if (useAuthStore.getState().token) {
    useAuthStore.getState().logout()
  }
}

export function getDemoUsers() {
  return api.get<DemoUser[]>("/auth/demo-users")
}

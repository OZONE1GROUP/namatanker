import { create } from "zustand"

export type Theme = "light" | "dark"

const THEME_STORAGE_KEY = "omanone.theme"

function loadStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === "light" || stored === "dark") return stored
  } catch {
    // localStorage unavailable (private mode, etc.) — fall through to default
  }
  return "light"
}

interface AppState {
  theme: Theme
  sidebarCollapsed: boolean
  toggleTheme: () => void
  toggleSidebar: () => void
}

const initialTheme = loadStoredTheme()
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("data-theme", initialTheme)
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: initialTheme,
  sidebarCollapsed: false,
  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light"
    document.documentElement.setAttribute("data-theme", next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // per-viewer convenience only — fine if it doesn't persist
    }
    set({ theme: next })
  },
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}))

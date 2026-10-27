import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"
import { useAuthStore } from "@/lib/auth"

// Unmount React trees, clear localStorage, and reset the Zustand auth store
// between every test. The store reads localStorage only once at
// module-init time and keeps its own in-memory copy after that, so within
// one test file a login in an earlier test would otherwise leak into a
// later one even after localStorage.clear().
afterEach(() => {
  cleanup()
  localStorage.clear()
  useAuthStore.setState({ token: null, user: null, status: "idle", error: null })
})

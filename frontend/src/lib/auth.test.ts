import { beforeEach, describe, expect, it, vi } from "vitest"
import { getAuthToken, handleUnauthorized, useAuthStore } from "./auth"

const USER = { id: "u1", username: "operator1", display_name: "Fahad Al-Harthy", role: "operator" }

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: "error",
      json: async () => body,
      text: async () => JSON.stringify(body),
    })
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe("useAuthStore.login", () => {
  it("stores the token/user and persists them to localStorage on success", async () => {
    mockFetchOnce(200, {
      access_token: "fake.jwt.token",
      token_type: "bearer",
      expires_in_minutes: 480,
      user: USER,
    })

    await useAuthStore.getState().login("operator1", "demo123")

    expect(useAuthStore.getState().token).toBe("fake.jwt.token")
    expect(useAuthStore.getState().user).toEqual(USER)
    expect(useAuthStore.getState().status).toBe("idle")
    expect(getAuthToken()).toBe("fake.jwt.token")

    const stored = JSON.parse(localStorage.getItem("omanone.auth")!)
    expect(stored.token).toBe("fake.jwt.token")
    expect(stored.user).toEqual(USER)
  })

  it("surfaces a wrong-password message on 401 and does not store anything", async () => {
    mockFetchOnce(401, "Incorrect username or password.")

    await expect(useAuthStore.getState().login("operator1", "wrong")).rejects.toThrow()

    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().status).toBe("error")
    expect(useAuthStore.getState().error).toBe("Incorrect username or password.")
    expect(localStorage.getItem("omanone.auth")).toBeNull()
  })

  it("surfaces an unreachable-backend message on a non-401 failure", async () => {
    mockFetchOnce(500, "Internal error")

    await expect(useAuthStore.getState().login("operator1", "demo123")).rejects.toThrow()
    expect(useAuthStore.getState().error).toBe("Could not reach the simulator backend. Is it running?")
  })
})

describe("useAuthStore.logout", () => {
  it("clears the store and localStorage", async () => {
    mockFetchOnce(200, {
      access_token: "fake.jwt.token",
      token_type: "bearer",
      expires_in_minutes: 480,
      user: USER,
    })
    await useAuthStore.getState().login("operator1", "demo123")
    expect(getAuthToken()).toBe("fake.jwt.token")

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(localStorage.getItem("omanone.auth")).toBeNull()
  })
})

describe("handleUnauthorized", () => {
  it("logs out a session that thought it was logged in", () => {
    useAuthStore.setState({ token: "stale-token", user: USER, status: "idle", error: null })
    handleUnauthorized()
    expect(useAuthStore.getState().token).toBeNull()
  })

  it("is a no-op when there was no session to begin with (avoids churn on the login page's own 401s)", () => {
    useAuthStore.setState({ token: null, user: null, status: "idle", error: null })
    const stateBefore = useAuthStore.getState()
    handleUnauthorized()
    // Zustand's `set` always produces a new state object, so an unchanged
    // reference is proof logout() (and therefore no state update) ran.
    expect(useAuthStore.getState()).toBe(stateBefore)
  })
})

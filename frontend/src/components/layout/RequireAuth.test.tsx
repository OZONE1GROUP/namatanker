import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { useAuthStore } from "@/lib/auth"
import { RequireAuth } from "./RequireAuth"

function renderGuarded(initialPath = "/orders") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login screen</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/orders" element={<div>Orders screen</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe("RequireAuth", () => {
  it("redirects to /login when there is no session", () => {
    useAuthStore.setState({ token: null, user: null, status: "idle", error: null })
    renderGuarded()
    expect(screen.getByText("Login screen")).toBeInTheDocument()
    expect(screen.queryByText("Orders screen")).not.toBeInTheDocument()
  })

  it("renders the guarded route when a session token is present", () => {
    useAuthStore.setState({
      token: "fake.jwt.token",
      user: { id: "u1", username: "operator1", display_name: "Fahad Al-Harthy", role: "operator" },
      status: "idle",
      error: null,
    })
    renderGuarded()
    expect(screen.getByText("Orders screen")).toBeInTheDocument()
    expect(screen.queryByText("Login screen")).not.toBeInTheDocument()
  })
})

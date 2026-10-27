import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAuthStore } from "@/lib/auth"
import { Login } from "./Login"

const DEMO_USERS = [
  {
    username: "operator1",
    password: "demo123",
    display_name: "Fahad Al-Harthy",
    role: "operator",
    role_label: "Terminal Operator",
    description: "Runs day-to-day order and loading workflow at the station.",
  },
]

const USER = { id: "u1", username: "operator1", display_name: "Fahad Al-Harthy", role: "operator" }

interface MockResponse {
  ok: boolean
  status: number
  statusText?: string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

function mockBackend({ loginOk }: { loginOk: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit): Promise<MockResponse> => {
      if (url === "/api/auth/demo-users") {
        return { ok: true, status: 200, json: async () => DEMO_USERS, text: async () => "" }
      }
      if (url === "/api/auth/login" && init?.method === "POST") {
        if (loginOk) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ access_token: "fake.jwt.token", token_type: "bearer", expires_in_minutes: 480, user: USER }),
            text: async () => "",
          }
        }
        return { ok: false, status: 401, statusText: "Unauthorized", json: async () => ({}), text: async () => "Incorrect username or password." }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  )
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
  useAuthStore.setState({ token: null, user: null, status: "idle", error: null })
})

describe("Login", () => {
  it("loads and renders the one-click demo-role buttons from /auth/demo-users", async () => {
    mockBackend({ loginOk: true })
    renderLogin()

    expect(await screen.findByText("Terminal Operator")).toBeInTheDocument()
    expect(screen.getByText(/Fahad Al-Harthy/)).toBeInTheDocument()
  })

  it("logs in and navigates to / when a demo-role button is clicked", async () => {
    mockBackend({ loginOk: true })
    const user = userEvent.setup()
    renderLogin()

    await user.click(await screen.findByText("Terminal Operator"))

    await waitFor(() => expect(screen.getByText("Home screen")).toBeInTheDocument())
    expect(useAuthStore.getState().user?.username).toBe("operator1")
  })

  it("shows an error and stays on the login screen when the password is wrong", async () => {
    mockBackend({ loginOk: false })
    const user = userEvent.setup()
    renderLogin()

    await user.type(screen.getByPlaceholderText(/username/i), "operator1")
    await user.type(screen.getByPlaceholderText(/password/i), "wrong-password")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    expect(await screen.findByText("Incorrect username or password.")).toBeInTheDocument()
    expect(screen.queryByText("Home screen")).not.toBeInTheDocument()
  })

  it("redirects straight to / when a session already exists", async () => {
    mockBackend({ loginOk: true })
    useAuthStore.setState({ token: "already-logged-in", user: USER, status: "idle", error: null })
    renderLogin()
    expect(await screen.findByText("Home screen")).toBeInTheDocument()
  })
})

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ErrorBoundary } from "./ErrorBoundary"

function Bomb(): never {
  throw new Error("Simulated render crash")
}

describe("ErrorBoundary", () => {
  it("renders its children normally when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>
    )
    expect(screen.getByText("All good")).toBeInTheDocument()
  })

  it("catches a render-time error and shows the fallback instead of crashing the app", () => {
    // React logs the caught error to the console by design; keep the test
    // output clean without hiding a genuinely uncaught error elsewhere.
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )

    expect(screen.getByText("Something went wrong on this screen")).toBeInTheDocument()
    expect(screen.getByText("Simulated render crash")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /back to executive overview/i })).toBeInTheDocument()

    consoleSpy.mockRestore()
  })
})

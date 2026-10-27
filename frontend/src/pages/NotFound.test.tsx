import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { NotFound } from "./NotFound"

describe("NotFound", () => {
  it("renders a message and a link back to the Executive Overview", () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    )
    expect(screen.getByText("Page not found")).toBeInTheDocument()
    const link = screen.getByRole("link", { name: /back to executive overview/i })
    expect(link).toHaveAttribute("href", "/")
  })
})

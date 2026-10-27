import { describe, expect, it } from "vitest"
import { initials, ROLE_LABELS } from "./roles"

describe("ROLE_LABELS", () => {
  it("has a human label for all 5 seeded demo roles (backend app/routers/auth.py's ROLE_LABELS)", () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual(
      ["admin", "auditor", "authorization_officer", "fleet_manager", "operator"].sort()
    )
  })
})

describe("initials", () => {
  it("takes the first letter of the first two words, upper-cased", () => {
    expect(initials("Fahad Al-Harthy")).toBe("FA")
    expect(initials("Talal Al-Farsi")).toBe("TA")
  })

  it("handles a single-word name", () => {
    expect(initials("Admin")).toBe("A")
  })

  it("handles extra whitespace without throwing", () => {
    expect(initials("  Noor   Al-Balushi ")).toBe("NA")
  })
})

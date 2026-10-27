import { describe, expect, it } from "vitest"
import { prettyStatus, statusTone } from "./orderStatus"

describe("prettyStatus", () => {
  it("replaces underscores with spaces and title-cases each word", () => {
    expect(prettyStatus("awaiting_authorization")).toBe("Awaiting Authorization")
    expect(prettyStatus("meter_discrepancy")).toBe("Meter Discrepancy")
    expect(prettyStatus("closed")).toBe("Closed")
  })
})

describe("statusTone", () => {
  it("maps every exception/failure state to red", () => {
    for (const s of ["rejected", "expired_authorization", "meter_discrepancy", "failed_reconciliation", "offline", "open"]) {
      expect(statusTone(s)).toBe("red")
    }
  })

  it("maps terminal success states to green", () => {
    for (const s of ["closed", "reconciled", "online", "resolved", "on_duty"]) {
      expect(statusTone(s)).toBe("green")
    }
  })

  it("maps in-progress/transitional states to blue", () => {
    for (const s of ["authorized", "dispatched", "loading_in_progress", "in_transit"]) {
      expect(statusTone(s)).toBe("blue")
    }
  })

  it("falls back to grey for any unrecognized status rather than throwing", () => {
    expect(statusTone("totally_made_up_status")).toBe("grey")
  })
})

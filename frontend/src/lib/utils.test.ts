import { describe, expect, it } from "vitest"
import { cn, formatDateTime, formatNumber, formatOMR, formatTime, formatVolume } from "./utils"

describe("cn", () => {
  it("merges class lists and lets a later Tailwind utility win over an earlier conflicting one", () => {
    expect(cn("px-2 text-sm", "px-4")).toBe("text-sm px-4")
  })

  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b")
  })
})

describe("formatNumber / formatVolume / formatOMR", () => {
  it("formats a plain number with thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567")
  })

  it("formats a volume in whole litres, rounded", () => {
    expect(formatVolume(10499.6)).toBe("10,500 L")
  })

  it("formats an OMR amount with 2 decimal places", () => {
    expect(formatOMR(1250)).toBe("OMR 1,250.00")
    expect(formatOMR(99.5)).toBe("OMR 99.50")
  })
})

describe("formatDateTime / formatTime", () => {
  // A fixed UTC instant so the Asia/Muscat (+04:00) rendering is deterministic.
  const iso = "2026-03-15T10:30:00Z" // 14:30 in Asia/Muscat

  it("renders a day/month/time in the simulator's Asia/Muscat timezone", () => {
    const out = formatDateTime(iso)
    expect(out).toContain("15 Mar")
    expect(out).toContain("14:30")
  })

  it("renders just the time portion in Asia/Muscat", () => {
    expect(formatTime(iso)).toBe("14:30")
  })
})

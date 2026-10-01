import { describe, expect, it } from "vitest"
import { escapePdfString, toLatin } from "../src/domain/pdfstring"

describe("escapePdfString", () => {
  it("escapes backslash, parens", () => {
    expect(escapePdfString("a\\b(c)d")).toBe("a\\\\b\\(c\\)d")
  })
  it("escapes newlines", () => {
    expect(escapePdfString("a\nb")).toBe("a\\nb")
  })
  it("leaves plain ASCII alone", () => {
    expect(escapePdfString("Hello World: $1,200.00")).toBe("Hello World: $1,200.00")
  })
  it("emits octal escapes for non-ASCII bytes (survives UTF-8 stream writing)", () => {
    expect(escapePdfString("café")).toBe("caf\\351")
    expect(escapePdfString("naïve")).toBe("na\\357ve")
  })
})

describe("toLatin", () => {
  it("keeps latin-1 characters", () => {
    expect(toLatin("café naïve")).toBe("café naïve")
  })
  it("replaces chars beyond latin-1 with ?", () => {
    expect(toLatin("中文 and €200")).toBe("?? and ?200")
  })
})

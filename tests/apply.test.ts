import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { exportEditedPdf } from "../src/domain/apply"
import { runFits } from "../src/domain/measure"
import { extractTextRuns } from "../src/domain/textrun"
import { makeFixtureBytes } from "./helpers/make-fixture"

function reopen(bytes: Uint8Array) {
  const doc = mupdf.PDFDocument.openDocument(bytes, "application/pdf")
  return { doc, page: doc.loadPage(0) }
}

describe("exportEditedPdf", () => {
  it("applies replace edits (old text truly gone) and keeps untouched lines", () => {
    const runs = extractTextRuns(reopen(makeFixtureBytes()).page, 0)
    const beta = runs.find((r) => r.text.includes("Beta"))
    const alpha = runs.find((r) => r.text.startsWith("Alpha"))
    const out = exportEditedPdf(makeFixtureBytes(), [
      { kind: "replace", run: beta!, newText: "Beta total: $9,999.99", coverColor: [1, 1, 1] },
      { kind: "replace", run: alpha!, newText: "Alpha EDITED", coverColor: [1, 1, 1] },
    ])
    const texts = extractTextRuns(reopen(out).page, 0).map((r) => r.text)
    expect(texts).toContain("Beta total: $9,999.99")
    expect(texts).toContain("Alpha EDITED")
    expect(texts).toContain("Gamma line")
    expect(texts.some((t) => t.includes("1,200.00"))).toBe(false)
    expect(texts.some((t) => t === "Alpha line")).toBe(false)
  })

  it("exports highlights as standard PDF annotations", () => {
    const { page } = reopen(makeFixtureBytes())
    const alpha = extractTextRuns(page, 0)[0]
    const q = alpha.bbox
    const out = exportEditedPdf(makeFixtureBytes(), [
      { kind: "highlight", pageIndex: 0, quads: [[q[0], q[1], q[2], q[1], q[0], q[3], q[2], q[3]]], color: [1, 1, 0] },
    ])
    const { page: page2 } = reopen(out)
    const annots = page2.getAnnotations()
    expect(annots).toHaveLength(1)
    expect(annots[0].getType()).toBe("Highlight")
    expect(annots[0].getQuadPoints()).toHaveLength(1)
  })

  it("draws the replacement at the original baseline, size, and color", () => {
    const { page } = reopen(makeFixtureBytes())
    const beta = extractTextRuns(page, 0).find((r) => r.text.includes("Beta"))!
    const out = exportEditedPdf(makeFixtureBytes(), [
      { kind: "replace", run: beta, newText: "Beta total: $9,999.99", coverColor: [1, 1, 1] },
    ])
    const replacement = extractTextRuns(reopen(out).page, 0).find((r) => r.text.includes("9,999.99"))!
    expect(replacement.size).toBeCloseTo(beta.size)
    expect(replacement.color).toEqual(beta.color)
    expect(replacement.origin[0]).toBeCloseTo(beta.origin[0], 1)
    expect(replacement.origin[1]).toBeCloseTo(beta.origin[1], 1)
  })

  it("round-trips non-ASCII Latin-1 replacement text without mojibake", () => {
    const { page } = reopen(makeFixtureBytes())
    const alpha = extractTextRuns(page, 0).find((r) => r.text.startsWith("Alpha"))!
    const out = exportEditedPdf(makeFixtureBytes(), [
      { kind: "replace", run: alpha, newText: "Alpha café naïve", coverColor: [1, 1, 1] },
    ])
    const texts = extractTextRuns(reopen(out).page, 0).map((r) => r.text)
    expect(texts).toContain("Alpha café naïve")
    expect(texts.some((t) => t.includes("Ã©") || t.includes("Ã¯"))).toBe(false)
  })

  it("is idempotent: exporting twice from original bytes gives the same text content", () => {
    const runs = extractTextRuns(reopen(makeFixtureBytes()).page, 0)
    const edit = { kind: "replace" as const, run: runs[0], newText: "Replaced!", coverColor: [1, 1, 1] as [number, number, number] }
    const out1 = exportEditedPdf(makeFixtureBytes(), [edit])
    const out2 = exportEditedPdf(makeFixtureBytes(), [edit])
    const t1 = extractTextRuns(reopen(out1).page, 0).map((r) => r.text)
    const t2 = extractTextRuns(reopen(out2).page, 0).map((r) => r.text)
    expect(t1).toEqual(t2)
  })
})

describe("runFits", () => {
  it("rejects replacements wider than the run and accepts fitting ones", () => {
    const runs = extractTextRuns(reopen(makeFixtureBytes()).page, 0)
    const beta = runs.find((r) => r.text.includes("Beta"))!
    expect(runFits("Beta total: $9,999.99", beta)).toBe(true)
    expect(runFits("Beta total: $9,999.99 with a lot of extra words appended", beta)).toBe(false)
  })
})

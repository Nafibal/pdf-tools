import * as mupdf from "mupdf"
import { describe, expect, it } from "vitest"
import { extractTextRuns, runAtPoint } from "../src/domain/textrun"
import { FIXTURE_LINES, makeFixtureBytes } from "./helpers/make-fixture"

function openPage() {
  const doc = mupdf.PDFDocument.openDocument(makeFixtureBytes(), "application/pdf")
  return doc.loadPage(0)
}

describe("extractTextRuns", () => {
  it("extracts one run per fixture line with geometry", () => {
    const runs = extractTextRuns(openPage(), 0)
    expect(runs.map((r) => r.text)).toEqual(FIXTURE_LINES)
    for (const run of runs) {
      expect(run.pageIndex).toBe(0)
      expect(run.size).toBeCloseTo(18)
      expect(run.color).toEqual([0, 0, 0])
      expect(run.bbox[0]).toBeLessThan(run.bbox[2])
      expect(run.bbox[1]).toBeLessThan(run.bbox[3])
      expect(run.origin[1]).toBeGreaterThan(run.bbox[1])
      expect(run.origin[1]).toBeLessThan(run.bbox[3])
    }
  })

  it("prefixes ids with the page index", () => {
    const runs = extractTextRuns(openPage(), 3)
    expect(runs[0].id).toMatch(/^3:/)
  })
})

describe("runAtPoint", () => {
  it("finds the run under a point", () => {
    const runs = extractTextRuns(openPage(), 0)
    const hit = runAtPoint(runs, runs[1].bbox[0] + 2, (runs[1].bbox[1] + runs[1].bbox[3]) / 2)
    expect(hit?.text).toBe("Beta total: $1,200.00")
  })

  it("returns null when the point misses all runs", () => {
    const runs = extractTextRuns(openPage(), 0)
    expect(runAtPoint(runs, 5, 5)).toBeNull()
  })
})

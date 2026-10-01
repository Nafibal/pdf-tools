import type * as mupdf from "mupdf"
import type { Point, Rect, RGB, TextRun } from "./types"

/**
 * Extract Text Runs from a page using MuPDF's structured-text walker.
 * Each walker line becomes one run; a run keeps the first char's font, size,
 * and color, and its baseline origin for redraw positioning.
 */
export function extractTextRuns(page: mupdf.PDFPage, pageIndex: number): TextRun[] {
  const runs: TextRun[] = []
  let cur: TextRun | null = null
  let lineIndex = 0
  page.toStructuredText({}).walk({
    beginLine(bbox: Rect) {
      cur = {
        id: `${pageIndex}:${lineIndex++}`,
        pageIndex,
        text: "",
        bbox: [bbox[0], bbox[1], bbox[2], bbox[3]],
        origin: [0, 0],
        size: 0,
        color: [0, 0, 0],
        fontName: "",
      }
    },
    onChar(c: string, origin: Point, font: mupdf.Font, size: number, _quad: unknown, color: RGB) {
      if (!cur) return
      if (cur.text.length === 0) {
        cur.origin = [origin[0], origin[1]]
        cur.size = size
        cur.fontName = font.getName()
        cur.color = [color[0], color[1] ?? 0, color[2] ?? 0]
      }
      cur.text += c
    },
    endLine() {
      if (cur && cur.text.trim().length > 0) runs.push(cur)
      cur = null
    },
  })
  return runs
}

/** Hit-test: the run whose bbox (padded by margin pt) contains the point. */
export function runAtPoint(runs: readonly TextRun[], x: number, y: number, margin = 1): TextRun | null {
  for (const run of runs) {
    const [x0, y0, x1, y1] = run.bbox
    if (x >= x0 - margin && x <= x1 + margin && y >= y0 - margin && y <= y1 + margin) return run
  }
  return null
}

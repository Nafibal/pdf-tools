// Pure domain types — no mupdf dependency. mupdf's Rect/Point/Quad are
// structurally identical tuples, so values flow straight through.
export type Rect = [number, number, number, number]
export type Point = [number, number]
export type Quad = [number, number, number, number, number, number, number, number]
export type RGB = [number, number, number]

/** The largest span of glyphs with a common baseline MuPDF reports as one line. Atomic unit of a Content Edit. */
export interface TextRun {
  id: string
  pageIndex: number
  text: string
  bbox: Rect
  /** First char's baseline origin, fz page coords (y-down). */
  origin: Point
  size: number
  color: RGB
  fontName: string
}

export interface ReplaceEdit {
  kind: "replace"
  run: TextRun
  newText: string
  coverColor: RGB
}

export interface HighlightEdit {
  kind: "highlight"
  pageIndex: number
  /** Quads in fz page coords (y-down). */
  quads: Quad[]
  color: RGB
}

export type Edit = ReplaceEdit | HighlightEdit

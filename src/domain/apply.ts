import * as mupdf from "mupdf"
import { escapePdfString, toLatin } from "./pdfstring"
import type { Edit, Rect } from "./types"

const FONT_KEY_PREFIX = "PdfEditF"
/** pt of slack around the redacted area; shared with the session preview so both agree. */
export const COVER_PAD = 1

/**
 * Rebuild the edited PDF from the original bytes plus the edit list.
 * The original is never touched; each export is a fresh build, which makes
 * this idempotent and makes undo trivial.
 */
export function exportEditedPdf(original: Uint8Array, edits: readonly Edit[]): Uint8Array {
  const doc = new mupdf.PDFDocument(original.slice())
  const fontObj = doc.addSimpleFont(new mupdf.Font("Helvetica"), "Latin")
  const pageIndex = groupBy(edits, (e) => (e.kind === "highlight" ? e.pageIndex : e.run.pageIndex))
  for (const [i, pageEdits] of pageIndex) {
    const page = doc.loadPage(i)
    applyReplaces(doc, page, pageEdits.filter((e) => e.kind === "replace"), fontObj)
    for (const edit of pageEdits) {
      if (edit.kind === "highlight") {
        const annot = page.createAnnotation("Highlight")
        annot.setQuadPoints(edit.quads)
        annot.setColor(edit.color)
        annot.update()
      }
    }
  }
  return doc.saveToBuffer("garbage=1").asUint8Array().slice()
}

function applyReplaces(
  doc: mupdf.PDFDocument,
  page: mupdf.PDFPage,
  replaces: Extract<Edit, { kind: "replace" }>[],
  fontObj: mupdf.PDFObject,
): void {
  if (replaces.length === 0) return
  // Remove the old text runs from the content stream (one redact annotation
  // per run, then a single redaction pass), then draw cover + replacement.
  for (const edit of replaces) {
    const [x0, y0, x1, y1] = edit.run.bbox
    const redact = page.createAnnotation("Redact")
    redact.setRect([x0 - COVER_PAD, y0 - COVER_PAD, x1 + COVER_PAD, y1 + COVER_PAD] satisfies Rect)
    redact.update()
  }
  page.applyRedactions(
    false,
    mupdf.PDFPage.REDACT_IMAGE_NONE,
    mupdf.PDFPage.REDACT_LINE_ART_NONE,
    mupdf.PDFPage.REDACT_TEXT_REMOVE,
  )
  const inv = mupdf.Matrix.invert(page.getTransform())
  const fontKey = reserveFontKey(page)
  const ops = replaces.map((edit) => replaceOps(edit, inv, fontKey)).join("\n")
  appendContentStream(doc, page.getObject(), ops, { fontObj, fontKey })
}

/** Content-stream ops for one replacement: cover box + text at the original baseline. */
function replaceOps(edit: Extract<Edit, { kind: "replace" }>, inv: mupdf.Matrix, fontKey: string): string {
  const { run, newText, coverColor } = edit
  const pdfRect = mupdf.Rect.transform(run.bbox, inv)
  const [px, py] = applyMatrix(inv, run.origin)
  const [x0, y0, x1, y1] = pdfRect
  const text = escapePdfString(toLatin(newText))
  const [r, g, b] = coverColor
  const [tr, tg, tb] = run.color
  return [
    `q ${r} ${g} ${b} rg ${x0 - COVER_PAD} ${y0 - COVER_PAD} ${x1 - x0 + COVER_PAD * 2} ${y1 - y0 + COVER_PAD * 2} re f Q`,
    `q BT /${fontKey} ${run.size} Tf ${tr} ${tg} ${tb} rg ${px} ${py} Td (${text}) Tj ET Q`,
  ].join("\n")
}

function applyMatrix(m: mupdf.Matrix, p: [number, number]): [number, number] {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]
}

function reserveFontKey(page: mupdf.PDFPage): string {
  const resources = page.getObject().get("Resources")
  if (resources.isNull()) return FONT_KEY_PREFIX + "0"
  const fonts = resources.get("Font")
  if (fonts.isNull()) return FONT_KEY_PREFIX + "0"
  const taken = new Set<string>()
  fonts.forEach((_val: mupdf.PDFObject, key: number | string) => {
    if (typeof key === "string") taken.add(key)
  })
  let n = 0
  while (taken.has(FONT_KEY_PREFIX + n)) n++
  return FONT_KEY_PREFIX + n
}

function appendContentStream(
  doc: mupdf.PDFDocument,
  pageObj: mupdf.PDFObject,
  ops: string,
  font: { fontObj: mupdf.PDFObject; fontKey: string },
): void {
  const newStream = doc.addStream(ops, {})
  const contents = pageObj.get("Contents")
  if (contents.isArray()) {
    contents.push(newStream)
  } else if (contents.isNull()) {
    pageObj.put("Contents", newStream)
  } else {
    const arr = doc.newArray()
    arr.push(contents)
    arr.push(newStream)
    pageObj.put("Contents", arr)
  }
  const resources = pageObj.get("Resources")
  if (resources.isNull()) {
    pageObj.put("Resources", { Font: { [font.fontKey]: font.fontObj } })
  } else {
    const fonts = resources.get("Font")
    if (fonts.isNull()) resources.put("Font", { [font.fontKey]: font.fontObj })
    else fonts.put(font.fontKey, font.fontObj)
  }
}

function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const list = map.get(key(item)) ?? []
    list.push(item)
    map.set(key(item), list)
  }
  return map
}

// Builds a small in-memory PDF with known text, used by tests.
import * as mupdf from "mupdf"

export const FIXTURE_LINES = ["Alpha line", "Beta total: $1,200.00", "Gamma line"]

export function makeFixtureBytes(): Uint8Array {
  const doc = new mupdf.PDFDocument()
  const fontRef = doc.addSimpleFont(new mupdf.Font("Helvetica"), "Latin")
  const ops = FIXTURE_LINES.map(
    (line, i) => `q BT /F1 18 Tf 0 0 0 rg 72 ${700 - i * 40} Td (${line}) Tj ET Q`,
  ).join("\n")
  const pageObj = doc.addPage([0, 0, 612, 792], 0, { Font: { F1: fontRef } }, ops)
  doc.insertPage(0, pageObj)
  return doc.saveToBuffer("garbage=1").asUint8Array().slice()
}

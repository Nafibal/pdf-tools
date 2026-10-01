// Capability probe for the mupdf WASM engine. Run: npm run probe
// Validates the full edit pipeline in Node before any UI exists:
//   fixture creation -> walker text extraction -> highlight annotation ->
//   content-stream cover-and-redraw -> save -> reopen -> verify.
// Also validates the engine APIs the toolbox Tools depend on:
//   page grafting across documents (Merge), page-subset extraction (Split),
//   and a Stamp annotation with an embedded image (Sign).
import * as mupdf from "mupdf"

const results: string[] = []
function check(name: string, ok: boolean, detail = ""): void {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`)
}

type ExtractedLine = {
  text: string
  bbox: mupdf.Rect
  origin: mupdf.Point // first char baseline origin (fz coords, y-down)
  size: number
  fontName: string
  color: number[] // rgb 0..1
  charCount: number
}

function extractLines(page: mupdf.PDFPage): ExtractedLine[] {
  const lines: ExtractedLine[] = []
  let cur: ExtractedLine | null = null
  page.toStructuredText({}).walk({
    beginLine(bbox: mupdf.Rect) {
      cur = { text: "", bbox: [...bbox] as mupdf.Rect, origin: [0, 0], size: 0, fontName: "", color: [0, 0, 0], charCount: 0 }
    },
    onChar(c: string, origin: mupdf.Point, font: mupdf.Font, size: number, _quad: mupdf.Quad, color: mupdf.Color) {
      if (!cur) return
      if (cur.charCount === 0) {
        cur.origin = [origin[0], origin[1]]
        cur.size = size
        cur.fontName = font.getName()
        cur.color = [color[0], color[1] ?? 0, color[2] ?? 0]
      }
      cur.text += c
      cur.charCount++
    },
    endLine() {
      if (cur && cur.charCount > 0) lines.push(cur)
      cur = null
    },
  })
  return lines
}

// ---------- 1. Create a fixture PDF with known text ----------
const doc = new mupdf.PDFDocument()
const fontRef = doc.addSimpleFont(new mupdf.Font("Helvetica"), "Latin")
const content = `q BT /F1 24 Tf 0 0 0 rg 72 720 Td (Hello World) Tj ET Q
q BT /F1 18 Tf 0 0 0 rg 72 660 Td (Invoice total: \\$1,200.00) Tj ET Q`
const resources = { Font: { F1: fontRef } }
const pageObj = doc.addPage([0, 0, 612, 792], 0, resources, content)
doc.insertPage(0, pageObj)
const fixtureBytes = doc.saveToBuffer("garbage=1").asUint8Array()
check("create fixture PDF", fixtureBytes.length > 500, `${fixtureBytes.length} bytes`)

// ---------- 2. Reopen, extract lines via walker ----------
const doc2 = new mupdf.PDFDocument(fixtureBytes)
check("reopen fixture", doc2.isPDF() && doc2.countPages() === 1)
const page = doc2.loadPage(0)
const lines = extractLines(page)
check("walker extracts 2 lines", lines.length === 2, JSON.stringify(lines.map((l) => l.text)))
const target = lines.find((l) => l.text.includes("Invoice"))!
check("target line found with origin/size/color", !!target && target.size === 18 && target.color.length === 3,
  target ? `origin=${target.origin} size=${target.size} font=${target.fontName}` : "missing")

// ---------- 3. Highlight annotation renders on top ----------
const before = page.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB)
const targetQuad: mupdf.Quad = [
  target.bbox[0], target.bbox[1], target.bbox[2], target.bbox[1],
  target.bbox[0], target.bbox[3], target.bbox[2], target.bbox[3],
]
const hl = page.createAnnotation("Highlight")
hl.setQuadPoints([targetQuad])
hl.setColor([1, 1, 0])
hl.update()
const after = page.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB)
check("highlight changed page pixels", !pixmapsEqual(before, after))

// ---------- 4. Content edit: redact old run + cover + replacement ----------
const editPageObj = page.getObject()
const font2Ref = doc2.addSimpleFont(new mupdf.Font("Helvetica"), "Latin")
// Convert fz (y-down) coords to PDF user space (y-up) via the page transform.
const inv = mupdf.Matrix.invert(page.getTransform())
const pdfRect = mupdf.Rect.transform(target.bbox, inv)
const baselinePdf = applyMatrix(inv, target.origin[0], target.origin[1])[1]
const pad = 1
const replacement = "Invoice total: \\$9,999.99"
// Remove the old text run from the content stream entirely (extraction clean).
const redact = page.createAnnotation("Redact")
redact.setRect([
  target.bbox[0] - pad, target.bbox[1] - pad,
  target.bbox[2] + pad, target.bbox[3] + pad,
])
redact.update()
page.applyRedactions(false, mupdf.PDFPage.REDACT_IMAGE_NONE, mupdf.PDFPage.REDACT_LINE_ART_NONE, mupdf.PDFPage.REDACT_TEXT_REMOVE)
// Cover any remaining graphics, then draw the replacement at the original baseline.
const coverOps = `q 1 1 1 rg ${pdfRect[0] - pad} ${pdfRect[1] - pad} ${pdfRect[2] - pdfRect[0] + pad * 2} ${pdfRect[3] - pdfRect[1] + pad * 2} re f Q
q BT /F2 ${target.size} Tf ${target.color[0]} ${target.color[1]} ${target.color[2]} rg ${pdfRect[0]} ${baselinePdf} Td (${replacement}) Tj ET Q`
appendContentStream(doc2, editPageObj, coverOps, font2Ref)
const afterEdit = page.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB)
check("cover+redraw changed pixels again", !pixmapsEqual(after, afterEdit))
const darkRatio = sampleDarkRatio(afterEdit, target.bbox)
check("old text region is now light except new ink (covered)", darkRatio < 0.2, `dark ratio ${darkRatio.toFixed(3)}`)

// ---------- 5. Save, reopen, verify permanence + highlight survives ----------
const outBytes = doc2.saveToBuffer("garbage=1").asUint8Array().slice()
const doc3 = new mupdf.PDFDocument(outBytes)
const page3 = doc3.loadPage(0)
const annots3 = page3.getAnnotations()
check("highlight annotation survives save", annots3.length === 1 && annots3[0].getType() === "Highlight",
  `annots: ${annots3.map((a) => a.getType()).join(",")}`)
const lines3 = extractLines(page3)
const newText = lines3.map((l) => l.text).join("|")
check("cover-and-redraw is permanent page content", newText.includes("9,999.99") && !newText.includes("1,200.00"), newText)
const render3 = page3.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB)
check("reopened render matches pre-save render", diffRatio(afterEdit, render3) < 0.02, `diff ${(diffRatio(afterEdit, render3) * 100).toFixed(2)}%`)

// ---------- 6. Merge capability: graft pages across documents ----------
// The Merge domain function will reopen each input from bytes, graft every
// page in list order into a fresh document, and save. Prove that flow here.
const docAlpha = reopen(makeTextDoc(["Alpha page one"]))
const docBravo = reopen(makeTextDoc(["Bravo page two", "Bravo page three"]))
const alphaTextBefore = pageText(docAlpha.loadPage(0))
const bravoTextsBefore = [0, 1].map((i) => pageText(docBravo.loadPage(i)))
const merged = new mupdf.PDFDocument()
merged.graftPage(0, docAlpha, 0)
merged.graftPage(1, docBravo, 0)
merged.graftPage(2, docBravo, 1)
check("grafting did not modify source documents",
  docAlpha.countPages() === 1 && pageText(docAlpha.loadPage(0)) === alphaTextBefore &&
  docBravo.countPages() === 2 && bravoTextsBefore.every((t, i) => pageText(docBravo.loadPage(i)) === t),
  `alpha=${docAlpha.countPages()} page, bravo=${docBravo.countPages()} pages, text intact`)
const mergedReopened = reopen(merged)
check("merged output has the summed page count", mergedReopened.countPages() === 3, `${mergedReopened.countPages()} pages`)
const t0 = pageText(mergedReopened.loadPage(0))
const t1 = pageText(mergedReopened.loadPage(1))
const t2 = pageText(mergedReopened.loadPage(2))
check("each source's text is extractable in graft order", t0.includes("Alpha") && t1.includes("Bravo page two") && t2.includes("Bravo page three"),
  `[${t0}] [${t1}] [${t2}]`)

// ---------- 7. Split capability: graft a page subset into a new document ----------
// [2, 0] is non-contiguous and reversed on purpose: it proves the graft order
// fully controls the output order, which the contiguous-range UI also needs.
const docFour = reopen(makeTextDoc(["One", "Two", "Three", "Four"]))
const subsetIndices = [2, 0]
const subset = new mupdf.PDFDocument()
subsetIndices.forEach((srcIndex, at) => subset.graftPage(at, docFour, srcIndex))
check("grafting a page subset left the source document intact", docFour.countPages() === 4, `${docFour.countPages()} pages`)
const subsetReopened = reopen(subset)
check("subset output has exactly the requested page count", subsetReopened.countPages() === subsetIndices.length,
  `${subsetReopened.countPages()} pages`)
const s0 = pageText(subsetReopened.loadPage(0))
const s1 = pageText(subsetReopened.loadPage(1))
check("subset pages appear in requested order", s0.includes("Three") && s1.includes("One"), `[${s0}] [${s1}]`)

// ---------- 8. Sign capability: Stamp annotation with an embedded image ----------
// Build the signature-image fixture from the engine itself: a two-tone pixmap
// encoded as PNG, so the probe needs no image assets on disk and a flat-filled
// appearance stream cannot fake "the image renders". The engine stretches the
// stamp image to the annotation rect, so aspect-ratio fitting is a domain concern.
// Note: annotation rects via setRect/getRect are in fz page space (y-down,
// top-left origin) — the same space highlight quads use; the engine flips to
// PDF user space internally.
const PURPLE = [120, 40, 200]
const ORANGE = [255, 140, 0]
const sigPm = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 64, 32], false)
{
  const px = sigPm.getPixels()
  for (let i = 0; i < px.length; i += 3) {
    const leftHalf = (i / 3) % 64 < 32
    const c = leftHalf ? PURPLE : ORANGE
    px[i] = c[0]
    px[i + 1] = c[1]
    px[i + 2] = c[2]
  }
}
const sigImage = new mupdf.Image(sigPm.asPNG())
const signDoc = reopen(makeTextDoc(["Signature target page"]))
const signPage = signDoc.loadPage(0)
const stampRect: mupdf.Rect = [72, 300, 272, 400] // fz page space (y-down)
const stamp = signPage.createAnnotation("Stamp")
stamp.setRect(stampRect)
stamp.setStampImage(sigImage)
stamp.update()
function stampRenders(pm: mupdf.Pixmap): boolean {
  return sampleColorRatio(pm, leftHalfOf(stampRect), PURPLE) > 0.9 && sampleColorRatio(pm, rightHalfOf(stampRect), ORANGE) > 0.9
}
function stampRendersDetail(pm: mupdf.Pixmap): string {
  return `purple ${sampleColorRatio(pm, leftHalfOf(stampRect), PURPLE).toFixed(3)} orange ${sampleColorRatio(pm, rightHalfOf(stampRect), ORANGE).toFixed(3)}`
}
const stampPm = signPage.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB)
check("stamp image renders inside its rect pre-save", stampRenders(stampPm), stampRendersDetail(stampPm))

const signReopened = reopen(signDoc)
const signPageReopened = signReopened.loadPage(0)
const stampAnnots = signPageReopened.getAnnotations().filter((a) => a.getType() === "Stamp")
check("reopened file reports the annotation as a Stamp", stampAnnots.length === 1,
  `annots: ${signPageReopened.getAnnotations().map((a) => a.getType()).join(",")}`)
check("stamp rect survives save", stampAnnots.length === 1 && rectsClose(stampAnnots[0].getRect(), stampRect),
  stampAnnots.length === 1 ? `rect=${stampAnnots[0].getRect()}` : "no stamp")
const stampPm2 = signPageReopened.toPixmap(mupdf.Matrix.scale(1, 1), mupdf.ColorSpace.DeviceRGB)
check("reopened stamp renders the image inside its rect", stampRenders(stampPm2), stampRendersDetail(stampPm2))
// The image must be confined to the annotation rect: the bands above, below,
// and beside it (fixtures are 612x792) carry none of the image's colors.
const outsideBands: mupdf.Rect[] = [
  [0, 0, 612, stampRect[1]],
  [0, stampRect[3], 612, 792],
  [0, stampRect[1], stampRect[0], stampRect[3]],
  [stampRect[2], stampRect[1], 612, stampRect[3]],
]
check("no stamp ink outside its rect",
  outsideBands.every((band) => sampleColorRatio(stampPm2, band, PURPLE) === 0 && sampleColorRatio(stampPm2, band, ORANGE) === 0),
  `4 bands outside rect clean`)

// ---------- helpers ----------
function makeTextDoc(pageTexts: string[]): mupdf.PDFDocument {
  const doc = new mupdf.PDFDocument()
  const fontRef = doc.addSimpleFont(new mupdf.Font("Helvetica"), "Latin")
  pageTexts.forEach((text, i) => {
    const content = `q BT /F1 24 Tf 0 0 0 rg 72 720 Td (${text}) Tj ET Q`
    const pageObj = doc.addPage([0, 0, 612, 792], 0, { Font: { F1: fontRef } }, content)
    doc.insertPage(i, pageObj)
  })
  return doc
}

function reopen(doc: mupdf.PDFDocument): mupdf.PDFDocument {
  return new mupdf.PDFDocument(doc.saveToBuffer("garbage=1").asUint8Array().slice())
}

function pageText(page: mupdf.PDFPage): string {
  return extractLines(page).map((l) => l.text).join("|")
}

function appendContentStream(doc: mupdf.PDFDocument, pageObj: mupdf.PDFObject, ops: string, fontRef: mupdf.PDFObject): void {
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
  if (!resources.isNull()) {
    const fonts = resources.get("Font")
    if (fonts.isNull()) resources.put("Font", { F2: fontRef })
    else fonts.put("F2", fontRef)
  } else {
    pageObj.put("Resources", { Font: { F2: fontRef } })
  }
}

function applyMatrix(m: mupdf.Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

function pixmapsEqual(a: mupdf.Pixmap, b: mupdf.Pixmap): boolean {
  if (a.getWidth() !== b.getWidth() || a.getHeight() !== b.getHeight()) return false
  const pa = a.getPixels()
  const pb = b.getPixels()
  if (pa.length !== pb.length) return false
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return false
  return true
}

function diffRatio(a: mupdf.Pixmap, b: mupdf.Pixmap): number {
  const pa = a.getPixels()
  const pb = b.getPixels()
  let diff = 0
  for (let i = 0; i < pa.length; i += 100) if (Math.abs(pa[i] - pb[i]) > 8) diff++
  return diff / (pa.length / 100)
}

function sampleColorRatio(pm: mupdf.Pixmap, rect: mupdf.Rect, rgb: number[]): number {
  // Fraction of pixels in the fz-space rect within tolerance of the RGB color.
  let hit = 0
  let total = 0
  const x0 = Math.max(0, Math.floor(Math.min(rect[0], rect[2])))
  const y0 = Math.max(0, Math.floor(Math.min(rect[1], rect[3])))
  const x1 = Math.min(pm.getWidth(), Math.ceil(Math.max(rect[0], rect[2])))
  const y1 = Math.min(pm.getHeight(), Math.ceil(Math.max(rect[1], rect[3])))
  const px = pm.getPixels()
  const stride = pm.getStride()
  const comps = pm.getNumberOfComponents()
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      total++
      const o = y * stride + x * comps
      if (Math.abs(px[o] - rgb[0]) <= 12 && Math.abs(px[o + 1] - rgb[1]) <= 12 && Math.abs(px[o + 2] - rgb[2]) <= 12) hit++
    }
  return total === 0 ? 0 : hit / total
}

function rectsClose(a: mupdf.Rect, b: mupdf.Rect): boolean {
  return a.every((v, i) => Math.abs(v - b[i]) < 0.01)
}

function leftHalfOf(r: mupdf.Rect): mupdf.Rect {
  return [r[0], r[1], (r[0] + r[2]) / 2, r[3]]
}

function rightHalfOf(r: mupdf.Rect): mupdf.Rect {
  return [(r[0] + r[2]) / 2, r[1], r[2], r[3]]
}

function sampleDarkRatio(pm: mupdf.Pixmap, rect: mupdf.Rect): number {
  let dark = 0
  let total = 0
  const x0 = Math.max(0, Math.floor(rect[0]))
  const y0 = Math.max(0, Math.floor(rect[1]))
  const x1 = Math.min(pm.getWidth(), Math.ceil(rect[2]))
  const y1 = Math.min(pm.getHeight(), Math.ceil(rect[3]))
  const px = pm.getPixels()
  const stride = pm.getStride()
  const comps = pm.getNumberOfComponents()
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) {
      total++
      if (px[y * stride + x * comps] < 100) dark++
    }
  return total === 0 ? 1 : dark / total
}

console.log(results.join("\n"))
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1)

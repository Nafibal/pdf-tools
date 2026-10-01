// Capability probe for the mupdf WASM engine. Run: npm run probe
// Validates the full edit pipeline in Node before any UI exists:
//   fixture creation -> walker text extraction -> highlight annotation ->
//   content-stream cover-and-redraw -> save -> reopen -> verify.
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

// ---------- helpers ----------
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

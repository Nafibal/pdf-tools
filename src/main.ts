import * as mupdf from "mupdf"
import { exportEditedPdf } from "./domain/apply"
import { EditStore } from "./domain/editstore"
import { runFits } from "./domain/measure"
import { extractTextRuns, runAtPoint } from "./domain/textrun"
import type { TextRun } from "./domain/types"
import { drawEdits, pixmapToImage } from "./ui/draw"
import { openEditPopup } from "./ui/editpopup"

const HIGHLIGHT_COLOR: [number, number, number] = [1, 0.9, 0.2]
const COVER_COLOR: [number, number, number] = [1, 1, 1]

const els = {
  openBtn: document.getElementById("openBtn") as HTMLButtonElement,
  fileInput: document.getElementById("fileInput") as HTMLInputElement,
  undoBtn: document.getElementById("undoBtn") as HTMLButtonElement,
  prevBtn: document.getElementById("prevBtn") as HTMLButtonElement,
  nextBtn: document.getElementById("nextBtn") as HTMLButtonElement,
  exportBtn: document.getElementById("exportBtn") as HTMLButtonElement,
  pageInfo: document.getElementById("pageInfo")!,
  status: document.getElementById("status")!,
  main: document.querySelector("main")!,
  wrap: document.getElementById("canvasWrap")!,
  canvas: document.getElementById("pageCanvas") as HTMLCanvasElement,
  popup: document.getElementById("editPopup")!,
  input: document.getElementById("editInput") as HTMLInputElement,
  hint: document.getElementById("editHint")!,
  dropHint: document.getElementById("dropHint")!,
}

interface Session {
  fileName: string
  originalBytes: Uint8Array
  doc: mupdf.PDFDocument
  pageIndex: number
  scale: number // CSS px per fz point
  runs: TextRun[]
  structuredText: mupdf.StructuredText | null
}

let session: Session | null = null
const store = new EditStore()
let dragStart: [number, number] | null = null
let dragActive = false

function setStatus(msg: string): void {
  els.status.textContent = msg
}

async function openFile(file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let doc: mupdf.PDFDocument
  try {
    doc = new mupdf.PDFDocument(bytes)
  } catch {
    setStatus(`${file.name} is not a readable PDF`)
    return
  }
  if (doc.needsPassword()) {
    setStatus(`${file.name} is password-protected — not supported`)
    return
  }
  store.clear()
  session = { fileName: file.name, originalBytes: bytes, doc, pageIndex: 0, scale: 1, runs: [], structuredText: null }
  setStatus(`${file.name} — ${doc.countPages()} page${doc.countPages() === 1 ? "" : "s"}`)
  await loadPage()
}

async function loadPage(): Promise<void> {
  if (!session) return
  const page = session.doc.loadPage(session.pageIndex)
  session.runs = extractTextRuns(page, session.pageIndex)
  session.structuredText = page.toStructuredText({})
  await render()
}

async function render(): Promise<void> {
  if (!session) return
  const page = session.doc.loadPage(session.pageIndex)
  const bounds = page.getBounds()
  const availWidth = els.main.clientWidth - 40
  session.scale = Math.min(Math.max(availWidth / (bounds[2] - bounds[0]), 0.3), 2.5)
  const dpr = window.devicePixelRatio || 1
  const matrix = mupdf.Matrix.scale(session.scale * dpr, session.scale * dpr)
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB)
  const bitmap = await pixmapToImage(pixmap)
  pixmap.destroy()
  els.canvas.width = bitmap.width
  els.canvas.height = bitmap.height
  // Both style dimensions must be set on HiDPI screens, else the canvas
  // stretches vertically and pointer hit-testing is off by dpr.
  els.canvas.style.width = `${bitmap.width / dpr}px`
  els.canvas.style.height = `${bitmap.height / dpr}px`
  const ctx = els.canvas.getContext("2d")!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  drawEdits(ctx, store.edits, session.pageIndex, session.scale * dpr)
  els.pageInfo.textContent = `${session.pageIndex + 1} / ${session.doc.countPages()}`
  els.undoBtn.disabled = !store.canUndo()
  els.exportBtn.disabled = store.edits.length === 0
  els.prevBtn.disabled = session.pageIndex === 0
  els.nextBtn.disabled = session.pageIndex >= session.doc.countPages() - 1
  els.dropHint.style.display = session ? "none" : "flex"
}

// Pointer coords: canvas CSS px / scale = fz points.
function eventPoint(ev: PointerEvent): [number, number] {
  const rect = els.canvas.getBoundingClientRect()
  if (!session) return [0, 0]
  return [(ev.clientX - rect.left) / session.scale, (ev.clientY - rect.top) / session.scale]
}

els.canvas.addEventListener("pointerdown", (ev) => {
  if (!session) return
  dragStart = eventPoint(ev)
  dragActive = false
  els.canvas.setPointerCapture(ev.pointerId)
})

els.canvas.addEventListener("pointermove", (ev) => {
  if (!dragStart || !session) return
  const [x, y] = eventPoint(ev)
  if (Math.hypot(x - dragStart[0], y - dragStart[1]) > 4 / session.scale) dragActive = true
})

els.canvas.addEventListener("pointerup", (ev) => {
  if (!session || !dragStart) return
  const start: [number, number] = dragStart
  dragStart = null
  const [x, y] = eventPoint(ev)
  if (dragActive) {
    dragActive = false
    const quads = session.structuredText?.highlight(start, [x, y]) ?? []
    if (quads.length > 0) {
      store.add({ kind: "highlight", pageIndex: session.pageIndex, quads, color: HIGHLIGHT_COLOR })
      void render()
    }
  } else {
    const run = runAtPoint(session.runs, x, y)
    if (run) {
      openEditPopup({ popup: els.popup, input: els.input, hint: els.hint }, run, session.scale, {
        fits: (text) => runFits(text, run),
        onCommit: (newText) => {
          if (!session) return
          store.add({ kind: "replace", run, newText, coverColor: COVER_COLOR })
          void render()
        },
      })
    }
  }
})

els.openBtn.addEventListener("click", () => els.fileInput.click())
els.fileInput.addEventListener("change", () => {
  const file = els.fileInput.files?.[0]
  els.fileInput.value = ""
  if (file) void openFile(file)
})

// Drag-and-drop a PDF anywhere onto the page area.
document.addEventListener("dragover", (ev) => ev.preventDefault())
document.addEventListener("drop", (ev) => {
  ev.preventDefault()
  const file = ev.dataTransfer?.files?.[0]
  if (file) void openFile(file)
})

els.undoBtn.addEventListener("click", () => {
  store.undo()
  void render()
})

els.prevBtn.addEventListener("click", () => void turnPage(-1))
els.nextBtn.addEventListener("click", () => void turnPage(1))

async function turnPage(delta: number): Promise<void> {
  if (!session) return
  const next = session.pageIndex + delta
  if (next < 0 || next >= session.doc.countPages()) return
  session.pageIndex = next
  await loadPage()
}

els.exportBtn.addEventListener("click", () => void exportPdf())

async function exportPdf(): Promise<void> {
  if (!session) return
  try {
    const bytes = exportEditedPdf(session.originalBytes, store.edits)
    const blob = new Blob([bytes as BlobPart], { type: "application/pdf" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const base = session.fileName.replace(/\.pdf$/i, "")
    a.href = url
    a.download = `${base}-edited.pdf`
    a.click()
    URL.revokeObjectURL(url)
    setStatus(`Exported ${base}-edited.pdf`)
  } catch (err) {
    setStatus(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

document.addEventListener("keydown", (ev) => {
  if (document.activeElement === els.input) return
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
    ev.preventDefault()
    store.undo()
    void render()
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
    ev.preventDefault()
    if (!els.exportBtn.disabled) void exportPdf()
  }
})

let resizeTimer: ReturnType<typeof setTimeout> | undefined
window.addEventListener("resize", () => {
  if (!session) return
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => void render(), 150)
})

// Dev convenience: ?sample=1 loads the bundled public/sample.pdf through the
// regular openFile path, so editing is reachable without the OS file dialog.
if (new URLSearchParams(location.search).get("sample")) {
  fetch("/sample.pdf")
    .then(async (res) => new File([await res.arrayBuffer()], "sample.pdf", { type: "application/pdf" }))
    .then((file) => openFile(file))
    .catch((err) => setStatus(`Failed to load sample: ${err instanceof Error ? err.message : String(err)}`))
}

void render()

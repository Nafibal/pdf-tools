import type * as mupdf from "mupdf"
import { COVER_PAD } from "../domain/apply"
import type { Edit, Quad, RGB } from "../domain/types"

/** Encode a pixmap to a bitmap the canvas can draw. */
export function pixmapToImage(pm: mupdf.Pixmap): Promise<ImageBitmap> {
  const blob = new Blob([pm.asPNG() as BlobPart], { type: "image/png" })
  return createImageBitmap(blob)
}

function cssColor(color: RGB, alpha = 1): string {
  const [r, g, b] = color
  return alpha === 1 ? `rgb(${r * 255}, ${g * 255}, ${b * 255})` : `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${alpha})`
}

function quadPath(ctx: CanvasRenderingContext2D, quad: Quad, scale: number): void {
  const pts: [number, number][] = [
    [quad[0], quad[1]],
    [quad[2], quad[3]],
    [quad[6], quad[7]],
    [quad[4], quad[5]],
  ]
  ctx.beginPath()
  ctx.moveTo(pts[0][0] * scale, pts[0][1] * scale)
  for (const [x, y] of pts.slice(1)) ctx.lineTo(x * scale, y * scale)
  ctx.closePath()
  ctx.fill()
}

/**
 * Session preview of the edit list for one page: highlight quads, cover boxes
 * with replacement text on top. Coordinates are fz page points times scale
 * (scale already includes devicePixelRatio for canvas-pixel output).
 */
export function drawEdits(ctx: CanvasRenderingContext2D, edits: readonly Edit[], pageIndex: number, scale: number): void {
  for (const edit of edits) {
    if (edit.kind === "highlight" && edit.pageIndex === pageIndex) {
      ctx.fillStyle = cssColor(edit.color, 0.35)
      for (const quad of edit.quads) quadPath(ctx, quad, scale)
    } else if (edit.kind === "replace" && edit.run.pageIndex === pageIndex) {
      const [x0, y0, x1, y1] = edit.run.bbox
      ctx.fillStyle = cssColor(edit.coverColor)
      ctx.fillRect((x0 - COVER_PAD) * scale, (y0 - COVER_PAD) * scale, (x1 - x0 + COVER_PAD * 2) * scale, (y1 - y0 + COVER_PAD * 2) * scale)
      ctx.fillStyle = cssColor(edit.run.color)
      ctx.font = `${edit.run.size * scale}px Helvetica, Arial, sans-serif`
      ctx.fillText(edit.newText, edit.run.origin[0] * scale, edit.run.origin[1] * scale)
    }
  }
}

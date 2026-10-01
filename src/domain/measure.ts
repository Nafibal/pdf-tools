import * as mupdf from "mupdf"
import type { TextRun } from "./types"

let helvetica: mupdf.Font | null = null

function helveticaFont(): mupdf.Font {
  helvetica ??= new mupdf.Font("Helvetica")
  return helvetica
}

/** Width of text at a given size in the embedded replacement font, in pt. */
export function textWidth(text: string, size: number, font: mupdf.Font = helveticaFont()): number {
  let total = 0
  for (const ch of text) {
    const gid = font.encodeCharacter(ch)
    if (gid > 0) total += font.advanceGlyph(gid)
    else total += 0.5
  }
  return total * size
}

/** Whether replacement text fits inside the original run's width (1pt tolerance). */
export function runFits(newText: string, run: TextRun, font?: mupdf.Font): boolean {
  const boxWidth = run.bbox[2] - run.bbox[0]
  return textWidth(newText, run.size, font) <= boxWidth + 1
}

import type { TextRun } from "../domain/types"

const HINT_NORMAL = "Enter to apply · Esc to cancel"
const HINT_TOO_WIDE = "⚠ Wider than the original — it will overflow the covered area"

export interface EditPopupElements {
  popup: HTMLElement
  input: HTMLInputElement
  hint: HTMLElement
}

/**
 * Show the replacement-input popup over a Text Run's bbox (CSS px).
 * Enter commits, Escape cancels, clicking away cancels.
 */
export function openEditPopup(
  els: EditPopupElements,
  run: TextRun,
  scale: number,
  opts: { fits: (text: string) => boolean; onCommit: (text: string) => void },
): void {
  const { popup, input, hint } = els
  const width = Math.max((run.bbox[2] - run.bbox[0]) * scale * 1.15, 140)
  popup.style.left = `${run.bbox[0] * scale}px`
  popup.style.top = `${run.bbox[1] * scale}px`
  popup.style.width = `${width}px`
  input.style.fontSize = `${Math.max(run.size * scale, 10)}px`
  input.value = run.text

  const updateHint = () => {
    if (opts.fits(input.value)) {
      hint.textContent = HINT_NORMAL
      hint.classList.remove("warn")
    } else {
      hint.textContent = HINT_TOO_WIDE
      hint.classList.add("warn")
    }
  }
  const onKey = (ev: KeyboardEvent) => {
    ev.stopPropagation()
    if (ev.key === "Enter") {
      close()
      opts.onCommit(input.value)
    } else if (ev.key === "Escape") {
      close()
    }
    updateHint()
  }
  const close = () => {
    popup.style.display = "none"
    input.removeEventListener("keydown", onKey)
    input.removeEventListener("input", updateHint)
    input.removeEventListener("blur", close)
  }
  input.addEventListener("keydown", onKey)
  input.addEventListener("input", updateHint)
  input.addEventListener("blur", close)
  popup.style.display = "block"
  updateHint()
  input.focus()
  input.select()
}

import type { Edit } from "./types"

/**
 * The session's edit list. Exports always rebuild from the original file plus
 * this list, which makes them idempotent and makes undo trivial.
 * The list is append-only at the tail, with one exception: adding a
 * replacement for a Text Run that already has one swaps that entry, so a run
 * carries exactly one Content Edit.
 */
export class EditStore {
  private items: Edit[] = []

  get edits(): readonly Edit[] {
    return this.items
  }

  add(edit: Edit): void {
    // One Content Edit per Text Run: a second replacement of the same run
    // replaces the pending one instead of stacking two redactions.
    if (edit.kind === "replace") {
      this.items = this.items.filter((e) => !(e.kind === "replace" && e.run.id === edit.run.id))
    }
    this.items.push(edit)
  }

  undo(): Edit | null {
    return this.items.pop() ?? null
  }

  canUndo(): boolean {
    return this.items.length > 0
  }

  clear(): void {
    this.items = []
  }
}

import { describe, expect, it } from "vitest"
import { EditStore } from "../src/domain/editstore"
import type { HighlightEdit, ReplaceEdit, TextRun } from "../src/domain/types"

const run: TextRun = {
  id: "0:0",
  pageIndex: 0,
  text: "old",
  bbox: [10, 20, 110, 40],
  origin: [10, 35],
  size: 12,
  color: [0, 0, 0],
  fontName: "Helvetica",
}

const replace: ReplaceEdit = { kind: "replace", run, newText: "new", coverColor: [1, 1, 1] }
const replace2: ReplaceEdit = { kind: "replace", run: { ...run, id: "0:1", text: "two" }, newText: "x", coverColor: [1, 1, 1] }
const highlight: HighlightEdit = { kind: "highlight", pageIndex: 0, quads: [[0, 0, 1, 0, 0, 1, 1, 1]], color: [1, 1, 0] }

describe("EditStore", () => {
  it("starts empty with no undo", () => {
    const store = new EditStore()
    expect(store.edits).toHaveLength(0)
    expect(store.canUndo()).toBe(false)
    expect(store.undo()).toBeNull()
  })

  it("returns added edits in order", () => {
    const store = new EditStore()
    store.add(replace)
    store.add(highlight)
    expect(store.edits).toEqual([replace, highlight])
  })

  it("undoes last edit first (LIFO)", () => {
    const store = new EditStore()
    store.add(replace)
    store.add(highlight)
    expect(store.undo()).toBe(highlight)
    expect(store.undo()).toBe(replace)
    expect(store.canUndo()).toBe(false)
  })

  it("upserts a replace edit for the same run id", () => {
    const store = new EditStore()
    store.add(replace)
    const second: ReplaceEdit = { ...replace, newText: "better" }
    store.add(second)
    expect(store.edits).toHaveLength(1)
    expect((store.edits[0] as ReplaceEdit).newText).toBe("better")
    // a replace for a different run does not collide
    store.add(replace2)
    expect(store.edits).toHaveLength(2)
  })

  it("keeps multiple highlight edits even on the same page", () => {
    const store = new EditStore()
    store.add(highlight)
    store.add(highlight)
    expect(store.edits).toHaveLength(2)
  })

  it("clear resets", () => {
    const store = new EditStore()
    store.add(replace)
    store.clear()
    expect(store.edits).toHaveLength(0)
    expect(store.canUndo()).toBe(false)
  })
})

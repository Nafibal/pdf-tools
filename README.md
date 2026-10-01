# pdf-edit

A personal-use PDF editor that runs entirely in the browser. Files never leave
your machine — there is no server.

## Capabilities

- **Content Edit (L1 "redact and redraw")**: click a line of text, type a
  replacement. On export the original text run is removed from the page's
  content stream (it's gone even from copy-paste/text extraction), a cover box
  hides leftover graphics, and the replacement is drawn at the original
  baseline in embedded Helvetica at the original size and color. No reflow —
  the replacement must fit the space.
- **Highlight**: drag across text to mark it in yellow. Exported as standard
  PDF annotations: they stay editable/removable in any PDF viewer, and the
  text underneath remains selectable and searchable.
- **Undo** (Ctrl+Z), **Export** (Ctrl+S). Export always produces a new file;
  the opened PDF is never modified.

## Running

```
npm install
npm run dev        # dev server
npm test           # vitest suite
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build
npm run probe      # MuPDF engine capability probe (Node)
```

## Known limitations (deliberate, see docs/adr/)

- Replacement text uses embedded Helvetica regardless of the original font
  (visually close, not identical) — ADR-0002.
- A Content Edit replaces a whole line; no paragraph reflow — ADR-0002.
- Content Edits are permanent ink once exported; only Highlights remain
  editable after export — ADR-0002.
- Rotated pages: Highlights work on any page, but Content Edits assume
  unrotated pages (the baseline transform is only correct for the common
  0° case).
- Replacement text is limited to Latin-1 characters; others become `?`.
- Password-protected PDFs cannot be opened.

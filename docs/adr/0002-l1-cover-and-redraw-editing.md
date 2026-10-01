# Content Edits use the L1 "redact and redraw" model

True PDF content editing (editing text in place with the original fonts,
Acrobat-style) is infeasible for this project. We decided on L1 fidelity: a
Content Edit removes the original Text Run from the page's content stream
(MuPDF Redact annotation + REDACT_TEXT_REMOVE), draws an opaque box over the
region to hide leftover graphics, and draws replacement text at the original
baseline in embedded Helvetica with the run's original size and color. No
reflow; the replacement must fit the covered area.

This is stronger than a pure cover-and-redraw: the old text is gone even from
text extraction and copy-paste, not just visually hidden.

Consequences: once exported, a Content Edit is permanent ink — it cannot be
re-edited as an edit afterwards, and the replacement font is a Helvetica
approximation of the original. This is the deliberate price for a
weeks-not-years scope.

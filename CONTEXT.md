# PDF Edit

A personal-use PDF editor that runs entirely in the browser. It combines two
distinct capabilities: layering marks on top of pages, and modifying the pages'
actual content. Files never leave the user's machine.

## Language

**Annotation**:
A mark layered on top of a page — highlight, text box, drawing, stamp. Annotations never modify the page's original content.
_Avoid_: comment, markup, overlay (as a noun for the concept)

**Content Edit**:
A modification to the page's original text or image content itself, as opposed to an Annotation on top of it.
_Avoid_: edit (unqualified), change

**Personal Tool**:
An app built for its author alone. No accounts, no multi-user concerns, no hostile-input hardening beyond what the author's own files need.
_Avoid_: product, app for users

## Editing model

**Text Run**:
A visual line of text as the text-extraction engine reports it: one span sharing a common baseline and style. The atomic unit of a Content Edit.
_Avoid_: word, text block

**Highlight**:
The one Annotation type in scope: a translucent colored mark over a selected span of the page's text.
_Avoid_: markup, comment

**Cover**:
The opaque box drawn over a Content Edit's region to hide graphics the redaction leaves behind; the replacement text is drawn on top of it.
_Avoid_: whiteout, mask

**Export**:
Producing a new PDF file that contains all edits. The opened file is never modified.
_Avoid_: save, save-as, overwrite

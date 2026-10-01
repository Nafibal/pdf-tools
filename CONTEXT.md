# PDF Tools

A personal-use PDF toolbox that runs entirely in the browser. Four Tools share
one shell: Edit (an editor layering Annotations and applying Content Edits),
plus Merge, Split, and Sign over whole documents. Files never leave the user's
machine.

## Language

**Tool**:
One of the app's first-class capabilities on its home screen: Edit, Merge, Split, Sign.
_Avoid_: feature, mode

**Merge**:
A Tool that concatenates whole PDF files, in a chosen order, into one new file. It operates on raw files from disk and involves no edits.
_Avoid_: combine, join, append

**Split**:
A Tool that produces new PDF files from an open document: a chosen page range as one file, or every page as its own file. Outputs carry the edits already on those pages.
_Avoid_: extract, burst (as the tool name)

**Annotation**:
A mark layered on top of a page — highlight, text box, drawing, stamp, signature. Annotations never modify the page's original content.
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

**Signature**:
A visual signature placed on a page: an image carried as an Annotation. It is a picture of a signature, not a cryptographic digital signature.
_Avoid_: digital signature, e-signature

**Highlight**:
The one Annotation type in scope: a translucent colored mark over a selected span of the page's text.
_Avoid_: markup, comment

**Cover**:
The opaque box drawn over a Content Edit's region to hide graphics the redaction leaves behind; the replacement text is drawn on top of it.
_Avoid_: whiteout, mask

**Export**:
Producing new PDF file(s) that contain all edits on their pages. The opened file is never modified.
_Avoid_: save, save-as, overwrite

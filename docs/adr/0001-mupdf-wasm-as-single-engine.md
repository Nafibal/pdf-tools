# Use MuPDF (WASM) as the single PDF engine

We need rendering, structured text extraction, and writing (drawing content,
annotations) all inside the browser with no server. The official `mupdf` npm
package (WASM) provides all three in one coherent API and is robust on messy
real-world PDFs. AGPL is acceptable because this is a Personal Tool with no
distribution.

The alternative — pdf.js (Apache) for rendering/extraction plus pdf-lib (MIT)
for writing — is permissively licensed but forces us to stitch two libraries'
coordinate systems and object models together, and neither handles structured
text as well. Decided: one engine, `mupdf`.

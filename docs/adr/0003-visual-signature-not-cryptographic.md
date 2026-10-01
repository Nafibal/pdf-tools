# Sign is a visual signature, not a cryptographic one

"Sign" could mean placing a picture of a signature on a page, or producing a
legally verifiable digital signature (PKCS#7/CMS with certificates and a
byte-range digest). The mupdf WASM engine exposes no signing API, so real
signing would mean bringing in a second PDF library or hand-rolling a
WebCrypto signature pipeline — a large detour for a Personal Tool. Decided: a
Signature is a visual one, an image placed as an Annotation (single-engine
constraint per ADR 0001).

Consequences: a Signature is ink, not a guarantee — it carries no tamper
evidence and no identity verification. If cryptographic signing is ever
needed, it is a new engine decision, not an extension of this one.

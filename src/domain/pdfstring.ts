// PDF literal-string escaping and Latin-1 restriction for replacement text.

/**
 * Escape a Latin-1 string for a PDF literal string in a content stream.
 * The stream itself is written as UTF-8, but the embedded simple font decodes
 * single bytes via WinAnsi — so anything above ASCII must go out as an octal
 * escape (\351) to survive as one byte.
 */
export function escapePdfString(s: string): string {
  let out = ""
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code === 0x5c) out += "\\\\"
    else if (code === 0x28) out += "\\("
    else if (code === 0x29) out += "\\)"
    else if (code === 0x0a) out += "\\n"
    else if (code === 0x0d) out += "\\r"
    else if (code > 0x7e) out += `\\${code.toString(8).padStart(3, "0")}`
    else out += ch
  }
  return out
}

/** The embedded simple font uses Latin encoding: chars beyond Latin-1 cannot be shown. */
export function toLatin(s: string): string {
  let out = ""
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    out += code < 256 ? ch : "?"
  }
  return out
}

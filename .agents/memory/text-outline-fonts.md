---
name: Text outlining with opentype.js 2.0
description: opentype.js 2.0 interop quirks for extracting glyph outlines, and keeping text-layout code node-testable.
---

# opentype.js 2.0 interop

Rule: extract text outlines one character at a time (char → glyph → glyph path). Never use the font-level shaping helpers (`font.getPath` / `font.stringToGlyphs`).

**Why:** In opentype.js 2.0 the shaping helpers crash on fonts with rich GSUB tables (Inter among them). Per-glyph access bypasses shaping and is reliable. Kerning lookups can also throw — guard them. A missing character resolves to the .notdef glyph (index 0), which is the only way to detect and report unsupported characters.

**How to apply:** Any text-to-outline or glyph-preview work. Two more traps: glyph paths emit contours with no closing `Z` (contours are only M-delimited — close them explicitly or fills and point-in-path tests break), and WOFF **v1** files parse directly while woff2 does not, so prefer v1 binaries for bundled fonts.

# Node-testable layout

Keep text layout/geometry modules free of DOM APIs and bundler asset imports, with browser-only concerns (font fetching, SVG-based path sampling) isolated or injected. **Why:** this lets node unit tests exercise layout against real font binaries.

# Memory index

- [Clerk React version constraints](clerk-react-versions.md) — use @clerk/react 6.x + Show components; 5.x is broken at load; React stays pinned 19.1.0 via pnpm peer rules.
- [API security decisions](api-security-decisions.md) — same-origin API: CORS allowlist only, plus an origin guard middleware on mutations; never reflect origins with credentials.
- [Codegen vs vite dev server](codegen-vite-restart.md) — API codegen while vite dev is serving poisons its module graph (blank app); restart the web workflow after codegen before browser verification.
- [Text outlining fonts](text-outline-fonts.md) — opentype.js 2.0: extract outlines per glyph (shaping helpers crash on GSUB-heavy fonts); close contours explicitly; bundle WOFF v1.
- [Image trace engine](image-trace-engine.md) — tracer stays DOM-free (ASCII-raster vitest); nodes XOR points per part; recompute traceRole when combining parts or stitching drops content.

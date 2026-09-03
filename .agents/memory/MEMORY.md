# Memory index

- [Clerk React version constraints](clerk-react-versions.md) — use @clerk/react 6.x + Show components; 5.x is broken at load; React stays pinned 19.1.0 via pnpm peer rules.
- [API security decisions](api-security-decisions.md) — same-origin API: CORS allowlist only, plus an origin guard middleware on mutations; never reflect origins with credentials.
- [Codegen vs vite dev server](codegen-vite-restart.md) — API codegen while vite dev is serving poisons its module graph (blank app); restart the web workflow after codegen before browser verification.
- [Text outlining fonts](text-outline-fonts.md) — opentype.js 2.0: extract outlines per glyph (shaping helpers crash on GSUB-heavy fonts); close contours explicitly; bundle WOFF v1.
- [Image trace engine](image-trace-engine.md) — tracer stays DOM-free (ASCII-raster vitest); nodes XOR points per part; recompute traceRole when combining parts or stitching drops content.
- [Machine stitch formats](machine-stitch-formats.md) — pyembroidery is binary-layout ground truth but NOT trim policy: only plan-trimmed travels get trim flags; test via independent parsers.
- [Auto-satin defaults](satin-defaults.md) — width=2A/P + elongation gate; auto-defaults must stay under preflight limits minus pull growth; converted text is one path per word (per-letter split is the satin-lettering unlock).
- [Copilot plan safety](copilot-plan-safety.md) — enforce selection scope in BOTH validators; rigid paths (raw points, no nodes/traceRole) are style-only everywhere; Apply must rebase plans onto the live doc.
- [AI provider quirks](ai-provider-quirks.md) — gpt-5.x via AI Integrations rejects non-default temperature; omit sampling params from chat calls.

---
name: Image trace engine conventions
description: Rules to stay consistent with when touching raster→vector tracing or traced parts in Vector Studio
---

# Image trace engine conventions

- The tracing engine (imageTrace.ts) stays DOM-free: typed arrays in, loops out; only the UI rasterizes via canvas. **Why:** keeps the geometry unit-testable in vitest with ASCII-raster fixtures — the crack-edge tracer and hole handling regress silently without them. **How to apply:** never import browser APIs into the engine; add engine behavior changes with an ASCII-raster test.
- Traced parts are either single-loop (`nodes`, node-editable) or multi-loop (`points` path data, evenodd fill) — never both fields on one object. **Why:** renderer and node editor each trust exactly one source of truth.
- `traceRole: 'background'` is what digitizing uses to skip backgrounds. Any operation that combines/derives parts (merge, boolean ops) must recompute it: keep the role only when every input shares it. **Why:** a merged background+content part silently drops content from stitching otherwise (caught in e2e).
- 'auto' background removal only flood-removes border-connected pixels; enclosed same-color islands (e.g. a ring's white center) are honest content, kept as parts. Deleting them is a one-click part action by design.

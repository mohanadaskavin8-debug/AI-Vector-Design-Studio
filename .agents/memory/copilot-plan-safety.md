---
name: Copilot plan safety
description: Design decisions for AI-proposed edit plans — scope enforcement, rigid geometry policy, apply-time revalidation.
---

# AI copilot plan safety decisions

- **Selection scope is enforced twice.** When a request carries a non-empty selection, the server plan validator AND the client validator each drop ID-based operations targeting objects outside it (with warnings). Inserts stay allowed.
  **Why:** the model is untrusted; it can emit IDs beyond the requested scope, and one-sided enforcement leaves the other surface exploitable or drifting.
  **How to apply:** every new plan operation that references object IDs must pass through the shared ID-filtering path on both server and client, never ad-hoc ID handling.

- **Rigid geometry = style-only.** Paths/polygons whose geometry renders directly from raw point data (no editable nodes, no trace role) silently desync from bounds-only moves/resizes. AI plans therefore only restyle them: geometry patches are stripped, they anchor alignment without moving, and they are excluded from distribute/duplicate — each with a user-facing warning.
  **Why:** correctly transforming arbitrary SVG path data is real engine work, and the desync is editor-wide (manual dragging of imported SVG shapes has the same flaw), not copilot-specific.
  **How to apply:** features that move objects programmatically must detect rigid geometry and refuse the move honestly; the proper fix is converting imported path data to editable nodes at import time.

- **Apply re-validates AND re-executes against the live document.** Staged proposal results are preview-only; committing re-runs validation (locks, existence, scope) on the current document and executes only the re-sanitized plan, producing exactly one history entry.
  **Why:** applying a staging-time snapshot clobbers concurrent edits, and executing without revalidating ignores safety changes (e.g. an object locked while the proposal was under review).
  **How to apply:** never commit a stale snapshot or a stale plan for deferred mutations; revalidate then rebase pure plans onto current state at commit time.

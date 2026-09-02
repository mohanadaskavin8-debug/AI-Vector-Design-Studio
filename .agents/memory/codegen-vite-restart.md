---
name: Codegen vs vite dev server
description: Restart the web dev workflow after regenerating API client code
---

Rule: treat API client codegen like a server change — after regenerating the shared client sources, restart the web dev workflow before any browser-based verification.

**Why:** codegen deletes and rewrites files a running vite dev server is watching; vite's module graph keeps broken references and serves a blank app even after the files return and typecheck passes.

**How to apply:** codegen → restart web workflow → verify. A blank app right after codegen means a poisoned dev-server module graph, not an application bug.

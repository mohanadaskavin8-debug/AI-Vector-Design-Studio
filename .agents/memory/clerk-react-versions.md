---
name: Clerk React version constraints
description: Which @clerk/react major to use in this workspace and why 5.x is off-limits
---

# Clerk React version constraints

Use `@clerk/react` **6.x** with `@clerk/themes` **2.x** in this workspace. Do not downgrade to 5.x.

**Why:** 5.54.0 (the last 5.x) shipped with a fatally broken import — it references an export missing from every released `@clerk/shared`, so the app crashes at load. 6.x also renamed the control components: `SignedIn`/`SignedOut` are gone; use `<Show when="signed-in" | "signed-out">`.

**How to apply:** When touching Clerk deps or auth components, keep 6.x idioms (`Show`, `publishableKeyFromHost` from `@clerk/react/internal`). React itself stays pinned exactly 19.1.0 (Expo constraint) — Clerk peer-range mismatches are handled via `peerDependencyRules.allowedVersions` in pnpm-workspace.yaml, not by bumping React.

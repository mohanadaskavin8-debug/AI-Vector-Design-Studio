# Vector Studio

A desktop-first browser vector editor with a polished SVG workspace and extensible foundations for AI-assisted design and embroidery preparation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/vector-studio run dev` — run the Vector Studio editor
- `pnpm --filter @workspace/vector-studio run typecheck` — verify the editor
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Editor application: `artifacts/vector-studio/`
- Editor state and commands: `artifacts/vector-studio/src/store/editor.ts`
- SVG workspace interactions: `artifacts/vector-studio/src/components/editor/Workspace.tsx`
- Visual tokens and reduced-motion behavior: `artifacts/vector-studio/src/index.css`
- Shared API contract for later cloud features: `lib/api-spec/openapi.yaml`

## Architecture decisions

- The first editor milestone is frontend-only and persists projects locally; cloud persistence belongs to the later productization milestone.
- SVG remains the editable source of truth. Raster output is generated from the current SVG document.
- Document geometry stays in CSS pixels; the precision UI converts px, mm, cm, in, and pt only at the input/display boundary.
- Boolean geometry is deliberately limited to exact operations on two unrotated rectangles. Unsupported selections report a limitation instead of approximating a result.
- AI and embroidery surfaces must identify approximations, preview data, and unavailable capabilities honestly.
- AI image generation uses OpenAI through Replit AI Integrations. Results and deterministic edits remain staged until Apply; the provider route is same-origin, session-capability protected, and rate limited.
- Raster vectorization is explicitly a deterministic block-based editable-shape approximation, not model-backed contour tracing.
- Embroidery preparation is a separate local stitch-plan model generated deterministically from supported vector geometry. Metrics and preflight derive from its ordered commands, not from artwork-area guesses.
- Embroidery generation is bounded by per-region and whole-plan command limits. Satin-style scanning is labeled approximate; SVG/JSON are inspection exports, while machine formats remain unavailable until tested exporters exist.
- The editor uses a small external store so pointer-driven canvas updates do not force unrelated interface components to rerender.

## Product

Users can create, select, move, resize, rotate, style, group, organize, import, and export common vector objects. Advanced tools include Bezier and smoothed freehand paths with editable nodes, guides and snapping, alignment and distribution, professional text controls, supported boolean geometry, raster image layers, export presets, actionable preflight checks, provider-backed image generation, staged vectorization, reversible selection edits, and an inspectable embroidery stitch-plan workspace.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

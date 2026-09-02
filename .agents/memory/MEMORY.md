# Memory index

- [Clerk React version constraints](clerk-react-versions.md) — use @clerk/react 6.x + Show components; 5.x is broken at load; React stays pinned 19.1.0 via pnpm peer rules.
- [API security decisions](api-security-decisions.md) — same-origin API: CORS allowlist only, plus an origin guard middleware on mutations; never reflect origins with credentials.
- [Codegen vs vite dev server](codegen-vite-restart.md) — API codegen while vite dev is serving poisons its module graph (blank app); restart the web workflow after codegen before browser verification.

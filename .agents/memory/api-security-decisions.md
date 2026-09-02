---
name: API security decisions
description: Same-origin CORS policy and CSRF origin guard for the API server — keep consistent when adding routes
---

# API security decisions

The API is served **same-origin** behind the path-routed proxy (`/api/*`). Because auth is cookie-based (Clerk), the API must never reflect arbitrary origins with credentials.

**Rules:**
- CORS allows only our own hosts (derived from `REPLIT_DOMAINS` / `REPLIT_DEV_DOMAIN`, plus localhost in dev). Never `origin: true` with `credentials: true`.
- A middleware rejects state-changing requests (non-GET/HEAD/OPTIONS) whose `Origin` header is present and not allowlisted — `cors()` alone only withholds response headers; it does not stop execution.

**Why:** Credentialed reflected CORS lets any hostile website issue and read authenticated API calls with the visitor's session cookies (flagged as ship-blocking in review).

**How to apply:** New routes get this protection automatically (app-level middleware in the API server's app setup). If a future client is genuinely cross-origin (e.g. a native app webview), add its exact origin to the allowlist — do not loosen the policy.

---
name: AI provider quirks
description: Behavioral quirks of models reached through Replit AI Integrations that caused runtime failures.
---

# AI Integrations provider quirks

- **gpt-5.x-class chat models reject sampling params.** They return a 400 error for any non-default `temperature` (only the default 1 is supported), so a tuned temperature breaks every call.
  **How to apply:** when adding AI endpoints, omit `temperature` and other sampling knobs from chat.completions calls; get determinism from strict response validation, not sampling settings.

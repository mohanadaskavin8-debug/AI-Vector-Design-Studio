---
name: Auto-satin defaults
description: How narrow shapes are auto-defaulted to satin and the gates that keep the app from warning about its own defaults.
---

# Narrow-shape satin defaults

Effective ink width = 2·area/perimeter over even-odd contours (holes subtract area, every boundary adds perimeter) recovers ring wall thickness and letter stroke width, including multi-contour glyphs. It underestimates for compact blobs, so "consistently narrow" additionally requires isoperimetric elongation P²/(4π·A) ≥ ~1.6 (circle = 1, square ≈ 1.27).

**Why the span gate subtracts pull compensation:** stitched region bounds grow by up to one pull compensation per side, so an auto-chosen default gated at exactly the preflight limit could still trigger the preflight warning it was meant to respect. Any auto-default must stay under `limit − 2×pull` so the app never warns about its own choice.

**How to apply:** when adding new auto-defaults or suggestions that interact with preflight rules, gate on post-generation geometry (or conservatively pre-subtract growth), and keep both digitize flows (manual panel + assisted) on the shared default builder so they never diverge.

**Lettering limitation:** "Convert to outlines" emits ONE path object per text layer, so whole words usually exceed the 12 mm satin-span rule and stay fill; only single letters/monograms auto-satin. Per-letter (connected-component) region splitting is the unlock for satin lettering.

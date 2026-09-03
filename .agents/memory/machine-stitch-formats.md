---
name: Machine stitch format exports
description: Ground truth and deliberate deviations for DST/PES (and future JEF/EXP) machine-file encoders.
---

# Machine stitch format exports

**Rule:** pyembroidery's writers are the reference for stitch-file binary layouts, but do NOT copy its trim policy: it writes every non-initial PEC travel as a trim-jump. Our generated plans contain many short intra-region travels; encoding them as trims would cut thread constantly. Only travels the stitch plan explicitly trimmed get the PEC 0x20 trim flag (first split segment only); all other travels use the 0x10 jump flag. In DST, plan trims become the Tajima 3-jump net-zero wobble (+2,+2 / −4,−4 / +2,+2).

**Why:** The plan model treats travel and thread-cutting as separate concerns (trims are their own commands, folded into the next jump at export); reference writers assume trim-everywhere, which is wrong for dense fills.

**How to apply:** When adding another format (JEF/EXP/VP3), reuse planToMachineOps and map its `trim` flag to the format's trim/cut mechanism explicitly; never infer trims from jump length or copy a reference writer's blanket behavior. Also: DST header extents come from plan bounds (trim wobble excluded, matching reference writers), and tests parse the binaries with independent decoders rather than reusing encoder tables.

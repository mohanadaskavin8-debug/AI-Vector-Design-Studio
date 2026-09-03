// Cross-panel handoff: "Trace to shapes" on an image layer opens the AI
// panel's Trace tab preloaded with that layer. The AI panel mounts fresh when
// its sidebar tab activates, so a module-level pending slot is sufficient.

let pendingLayerId: string | null = null;

export const requestTraceLayer = (layerId: string) => {
  pendingLayerId = layerId;
};

/** Non-destructive check (used to pick the initial AI tab). */
export const peekTraceRequest = (): string | null => pendingLayerId;

/** Claims the pending request so it only fires once. */
export const consumeTraceRequest = (): string | null => {
  const value = pendingLayerId;
  pendingLayerId = null;
  return value;
};

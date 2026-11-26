const resets = new Set<() => void>();

/** Draft stores subscribe to account/workspace exit and access-loss cleanup. */
export function onPrivateStateReset(reset: () => void) {
  resets.add(reset);
  return () => {
    resets.delete(reset);
  };
}

export function resetPrivateState() {
  for (const reset of resets) reset();
}

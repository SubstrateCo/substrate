const resets = new Set<() => void>();

export function onPrivateStateReset(reset: () => void) {
  resets.add(reset);
  return () => {
    resets.delete(reset);
  };
}

export function resetPrivateState() {
  for (const reset of resets) reset();
}

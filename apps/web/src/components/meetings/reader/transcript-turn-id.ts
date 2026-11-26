/** The element id of one transcript turn row. */
export function turnRowId(originalId: string, turn: number) {
  return `turn-${originalId}-${turn}`;
}

import type { InteractionKind } from "@substrate/contracts/context/interactions";

export function interactionMinutes(kind: InteractionKind, value: string) {
  if (kind !== "call" && kind !== "meeting") return 0;
  if (value === "") return 0;
  if (!/^\d{1,4}$/.test(value) || Number(value) <= 0) return null;
  return Number(value);
}

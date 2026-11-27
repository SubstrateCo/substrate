/** A result already linked to the message can't be chosen again. */
export type LinkWorkState = "linked" | "selected" | "available";

export function linkWorkState({
  linked,
  chosen,
}: {
  linked: boolean;
  chosen: boolean;
}): LinkWorkState {
  if (linked) return "linked";
  return chosen ? "selected" : "available";
}

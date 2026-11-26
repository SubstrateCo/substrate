import type { TurnInterruption } from "../turns.ts";

const notes: Partial<Record<TurnInterruption, string>> = {
  owner:
    "Your owner interrupted the previous turn so that newer messages run first. Continue its work if it still matters.",
  retire:
    "The desktop switched to another organization while this turn ran. Continue its work if it still matters.",
  moved:
    "Your owner moved you to another desktop while the previous turn ran. Continue its work if it still matters.",
  app: "The desktop that ran the previous turn stopped responding. Continue its work if it still matters.",
};

/**
 * The resume note of a turn that ended early, if its work resumes in the session's next turn. A
 * stopped turn does not resume, and neither does one that ran too long.
 */
export function interruptionNote(interruption: TurnInterruption | null) {
  return interruption ? (notes[interruption] ?? null) : null;
}

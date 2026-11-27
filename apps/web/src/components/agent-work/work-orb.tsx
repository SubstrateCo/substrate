import type { WorkOrbState } from "@/lib/agent-work/status";
import { ThinkingOrb } from "thinking-orbs";

/** Live agent work; the adjacent status text supplies the accessible label. */
export function WorkOrb({ state = "solving" }: { state?: WorkOrbState }) {
  return <ThinkingOrb state={state} size={20} aria-hidden="true" className="shrink-0" />;
}

/** Live agent work in the place of the agent's avatar, the same size as a message avatar. */
export function WorkAvatar({ state }: { state: WorkOrbState }) {
  return (
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center">
      <ThinkingOrb state={state} size={32} />
    </span>
  );
}

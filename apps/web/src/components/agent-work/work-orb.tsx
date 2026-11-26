import { ThinkingOrb } from "thinking-orbs";

/** Live agent work; the adjacent status text supplies the accessible label. */
export function WorkOrb() {
  return <ThinkingOrb state="solving" size={20} aria-hidden="true" className="shrink-0" />;
}

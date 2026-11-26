import type { TurnOutputView } from "@substrate/contracts/agent-work";

import { messageLink } from "@/lib/navigation/record-links";

/** A turn's message output, as a link. Task outputs have no project here, so no link. */
export function outputLink(organizationId: string, output: TurnOutputView) {
  if (output.kind !== "message") return undefined;
  return messageLink(organizationId, output.conversationId, output.id);
}

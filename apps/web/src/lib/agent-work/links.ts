import type { AgentRequestView, TurnOutputView } from "@startup-os/contracts/agent-work";

import { messageHref, workHref } from "@/lib/navigation/record-links";

/** The forward link from an executed proposal to the message or task it created or changed. */
export function proposalResultLink(organizationId: string, request: AgentRequestView) {
  const outcome = request.proposal?.outcome;
  if (outcome?.status !== "executed") return undefined;
  const { receipt } = outcome;
  if (receipt.kind === "message")
    return {
      href: messageHref(organizationId, receipt.conversationId, receipt.id),
      label: "Open the message",
    };
  return {
    href: workHref(organizationId, receipt.projectId, receipt.id),
    label: "Open the task",
  };
}

/** The back link from a created message to the conversation the proposal came from. */
export function proposalSourceLink(organizationId: string, request: AgentRequestView) {
  const { place } = request;
  if (place.access !== "visible") return undefined;
  return {
    href: messageHref(organizationId, place.conversationId, place.anchorMessageId ?? undefined),
    label: place.conversationName,
  };
}

/** A turn's message output, as a link. Task outputs have no project here, so no link. */
export function outputLink(organizationId: string, output: TurnOutputView) {
  if (output.kind !== "message") return undefined;
  return messageHref(organizationId, output.conversationId, output.id);
}

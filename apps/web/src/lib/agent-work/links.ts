import type { AgentRequestView, TurnOutputView } from "@substrate/contracts/agent-work";

import { contactLink, crmLink, messageLink, workLink } from "@/lib/navigation/record-links";

/**
 * The forward link from an executed proposal to the message, task or project it created or
 * changed. A deleted record has no link.
 */
export function proposalResultLink(organizationId: string, request: AgentRequestView) {
  const outcome = request.proposal?.outcome;
  if (outcome?.status !== "executed") return undefined;
  const { receipt } = outcome;
  if (receipt.kind === "deleted") return undefined;
  if (receipt.kind === "message")
    return {
      link: messageLink(organizationId, receipt.conversationId, receipt.id),
      label: "Open the message",
    };
  if (receipt.kind === "project")
    return { link: workLink(organizationId, receipt.id), label: "Open the project" };
  if (receipt.kind === "crm")
    return receipt.entityType === "contact"
      ? { link: contactLink(organizationId, receipt.id), label: "Open the contact" }
      : {
          link: crmLink(organizationId, `${receipt.entityType}s`, receipt.id),
          label: `Open the ${receipt.entityType}`,
        };
  return {
    link: workLink(organizationId, receipt.projectId, receipt.id),
    label: "Open the task",
  };
}

/** The back link from a created message to the conversation the proposal came from. */
export function proposalSourceLink(organizationId: string, request: AgentRequestView) {
  const { place } = request;
  if (place.access !== "visible") return undefined;
  return {
    link: messageLink(organizationId, place.conversationId, place.anchorMessageId ?? undefined),
    label: place.conversationName,
  };
}

/** A turn's message output, as a link. Task outputs have no project here, so no link. */
export function outputLink(organizationId: string, output: TurnOutputView) {
  if (output.kind !== "message") return undefined;
  return messageLink(organizationId, output.conversationId, output.id);
}

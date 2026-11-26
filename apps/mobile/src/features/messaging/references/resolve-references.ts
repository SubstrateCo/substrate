import type { LinkedWork, MessageContext, MessagingConversationTarget } from "../types";
import { referenceKey, type ReferenceKind } from "./reference-tokens";
import type { RecordTarget } from "@/lib/navigation";

export type ReferenceDestination =
  | { type: "record"; target: RecordTarget }
  | { type: "conversation"; target: MessagingConversationTarget }
  | { type: "profile"; actorId: string };

export type ResolvedReference = {
  kind: ReferenceKind;
  id: string;
  label: string;
  destination?: ReferenceDestination;
};

const recordKinds: Partial<Record<LinkedWork["entityType"], RecordTarget["kind"]>> = {
  task: "task",
  project: "project",
  contact: "contact",
  account: "account",
  deal: "deal",
  contact_interaction: "interaction",
};

/** The record panel target for linked work, or nothing for kinds the shell does not open. */
export function linkedWorkTarget(link: LinkedWork): RecordTarget | undefined {
  const kind = recordKinds[link.entityType];
  if (!kind) return undefined;
  const target: RecordTarget = { kind, id: link.entityId };
  if (kind === "task" && link.projectEntityId) target.projectId = link.projectEntityId;
  return target;
}

/**
 * The references in a message that the viewer may open, keyed by `kind:id`. A token missing here
 * shows as unavailable, never with a guessed name.
 */
export function resolveReferences(context: MessageContext | undefined) {
  const resolved = new Map<string, ResolvedReference>();
  if (!context) return resolved;
  const add = (reference: ResolvedReference) =>
    resolved.set(referenceKey(reference.kind, reference.id), reference);
  for (const item of context.messaging) {
    const target: MessagingConversationTarget = { conversationId: item.conversationId };
    if (item.threadId) target.threadId = item.threadId;
    add({
      kind: item.kind,
      id: item.id,
      label: item.title,
      destination: { type: "conversation", target },
    });
  }
  for (const link of context.links) {
    if (link.entityType !== "task" && link.entityType !== "project") continue;
    const target = linkedWorkTarget(link);
    add({
      kind: link.entityType,
      id: link.entityId,
      label: link.title,
      destination: target && { type: "record", target },
    });
  }
  for (const person of context.people)
    add({
      kind: "person",
      id: person.id,
      label: person.name,
      destination: { type: "profile", actorId: person.id },
    });
  for (const agent of context.agents)
    add({
      kind: "agent",
      id: agent.id,
      label: agent.name,
      destination: { type: "profile", actorId: agent.id },
    });
  return resolved;
}

/** Labels of resolved references, so an edit shows names instead of tokens. */
export function referenceLabels(resolved: Map<string, ResolvedReference>) {
  return Object.fromEntries([...resolved].map(([key, reference]) => [key, reference.label]));
}

/**
 * The work to list under a message. Mentions already show as chips in the body. A record linked
 * for several reasons shows once, as "Created here" when the message created it, and can be
 * unlinked when any of its links can.
 */
export function attachedWork(links: readonly LinkedWork[]) {
  const byEntity = new Map<string, LinkedWork>();
  for (const link of links) {
    if (link.purpose === "mention") continue;
    const seen = byEntity.get(link.entityId);
    byEntity.set(
      link.entityId,
      seen
        ? {
            ...seen,
            purpose: seen.purpose === "source" ? seen.purpose : link.purpose,
            canRemove: seen.canRemove || link.canRemove,
          }
        : link,
    );
  }
  return [...byEntity.values()];
}

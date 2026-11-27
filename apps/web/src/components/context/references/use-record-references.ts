import type { RecordLabel } from "@substrate/contracts/context/input";
import { referenceKinds, type ReferenceKind } from "@substrate/contracts/messaging/references";

import { useQuery } from "@tanstack/react-query";

import type { WorkspaceReference } from "@/components/messaging/references/entity-reference";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { referenceTokenPattern } from "@/lib/messaging/reference-token";
import { messageLink, workLink } from "@/lib/navigation/record-links";
import { recordLabelsOptions } from "@/queries/context/links";

/** The label read takes at most this many IDs. */
const labelLimit = 50;

const labelTypes: Record<ReferenceKind, RecordLabel["type"]> = {
  task: "task",
  project: "project",
  person: "actor",
  agent: "actor",
  channel: "conversation",
  thread: "message",
};

function referenceLink(organizationId: string, kind: ReferenceKind, label: RecordLabel) {
  if (kind === "task" && label.projectId)
    return workLink(organizationId, label.projectId, label.id);
  if (kind === "project") return workLink(organizationId, label.id);
  if (kind === "channel") return messageLink(organizationId, label.id);
  if (kind === "thread" && label.conversationId)
    return messageLink(organizationId, label.conversationId, label.id);
  return undefined;
}

/**
 * The references in a message body, resolved by name outside its conversation, such as in a
 * record's discussions. The server names only records the viewer can open; the rest stay
 * unavailable.
 */
export function useRecordReferences(body: string) {
  const { organizationId } = useWorkspaceScope();
  const tokens = [...body.matchAll(referenceTokenPattern)].flatMap((match) => {
    const kind = referenceKinds.find((item) => item === match[1]!.toLowerCase());
    return kind ? [{ kind, id: match[2]! }] : [];
  });
  const ids = [...new Set(tokens.map((token) => token.id))].slice(0, labelLimit);
  const labels = useQuery(recordLabelsOptions(organizationId, ids));
  const byId = new Map((labels.data ?? []).map((label) => [label.id, label] as const));
  const references = tokens.flatMap(({ kind, id }): WorkspaceReference[] => {
    const label = byId.get(id);
    if (label?.type !== labelTypes[kind]) return [];
    return [{ id, kind, label: label.title, link: referenceLink(organizationId, kind, label) }];
  });
  return { references, loading: ids.length > 0 && labels.isPending };
}

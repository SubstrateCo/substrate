import type { ContextTargetType } from "@substrate/contracts/context/input";

type RecordKind = "task" | "project" | "contact" | "interaction" | "account" | "deal";

export type RecordTarget = { kind: RecordKind; id: string; projectId?: string };
export type OnOpenRecord = (target: RecordTarget) => void;
export type OnOpenConversation = (conversationId: string, messageId?: string) => void;

export type WorkspaceScreenProps = { organizationId: string; onOpenRecord: OnOpenRecord };

export function targetForEntity(
  entityType: ContextTargetType,
  entityId: string,
  projectEntityId?: string | null,
): RecordTarget | null {
  switch (entityType) {
    case "project":
    case "contact":
    case "account":
    case "deal":
      return { kind: entityType, id: entityId };
    case "task":
      return { kind: "task", id: entityId, projectId: projectEntityId ?? undefined };
    case "contact_interaction":
      return { kind: "interaction", id: entityId };
    case "calendar_event":
      return null;
  }
}

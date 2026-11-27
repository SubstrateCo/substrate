import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { ConversationSourceBar } from "./conversation-header";
import { ContactLink } from "@/components/contacts/contact-link";
import { entityKinds } from "@/components/context/entity-kinds";
import { CrmRecordSheet } from "@/components/crm/crm-record-sheet";
import { TaskRecordSheet } from "@/components/tasks/detail/task-record-sheet";
import { useOrganizationApps } from "@/components/workspace/organization-apps-context";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import type { Conversation } from "@/lib/messaging/conversations";
import type { MessageSource } from "@/lib/navigation/record-links";
import { contactOptions } from "@/queries/contacts/options";
import { accountOptions, dealOptions } from "@/queries/crm/options";

const linkClassName =
  "underline decoration-muted-foreground underline-offset-4 hover:text-muted-foreground";

/** Opens the conversation's record sheet over the pane, keeping the open thread. */
export function RecordSheetLink({ children }: { children: string }) {
  return (
    <Link
      to="/messages"
      search={(previous) => ({ ...previous, sheet: true })}
      resetScroll={false}
      className={linkClassName}
    >
      {children}
    </Link>
  );
}

/**
 * The CRM record the conversation was opened from. It shows only a record the viewer can read; a
 * contact opens in the workspace contact sheet, a deal or account in the conversation's sheet.
 */
export function ConversationSource({ source }: { source: MessageSource }) {
  const crm = useOrganizationApps().enabled("crm");
  const name = useSourceName(source, crm);
  if (!crm || !name) return null;
  const { icon: Icon, label } = entityKinds[source.type];
  return (
    <ConversationSourceBar
      icon={<Icon aria-hidden="true" />}
      label={`From ${label.toLowerCase()}`}
      link={
        source.type === "contact" ? (
          <ContactLink entityId={source.entityId} className={linkClassName}>
            {name}
          </ContactLink>
        ) : (
          <RecordSheetLink>{name}</RecordSheetLink>
        )
      }
    />
  );
}

/** The readable name of the source record, or nothing while it loads or when it is unreadable. */
function useSourceName(source: MessageSource, enabled: boolean) {
  const { organizationId } = useWorkspaceScope();
  const deal = useQuery({
    ...dealOptions(organizationId, source.entityId),
    enabled: enabled && source.type === "deal",
  });
  const account = useQuery({
    ...accountOptions(organizationId, source.entityId),
    enabled: enabled && source.type === "account",
  });
  const contact = useQuery({
    ...contactOptions(organizationId, source.entityId),
    enabled: enabled && source.type === "contact",
  });
  if (source.type === "deal") return deal.data?.deal.title;
  if (source.type === "account") return account.data?.account.name;
  return contact.data?.profile.displayName;
}

/** A task discussion's task, or the deal or account the conversation was opened from. */
export function ConversationRecordSheet({
  conversation,
  source,
  open,
  onClose,
}: {
  conversation: Conversation;
  source?: MessageSource;
  open: boolean;
  onClose: () => void;
}) {
  const crm = useOrganizationApps().enabled("crm");
  const { task } = conversation;
  if (task)
    return (
      <TaskRecordSheet
        open={open}
        task={{ projectEntityId: task.projectEntityId, taskEntityId: task.taskEntityId }}
        onClose={onClose}
      />
    );
  if (!crm || !source || source.type === "contact") return null;
  return (
    <CrmRecordSheet
      record={open ? { kind: source.type, entityId: source.entityId } : null}
      onClose={onClose}
    />
  );
}

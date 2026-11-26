import type { OnOpenRecord, RecordTarget } from "./types";
import { ContactDetailView } from "@/components/contacts/contact-detail";
import { AccountDetailView } from "@/components/crm/account-detail";
import { DealDetailView } from "@/components/crm/deal-detail";
import { InteractionDetailView } from "@/components/interactions/interaction-detail";
import { ProjectDetailView } from "@/components/tasks/project-detail";
import { TaskDetailView } from "@/components/tasks/task-detail";

export type RecordDetailProps = {
  organizationId: string;
  target: RecordTarget;
  onOpenRecord: OnOpenRecord;
  onClose: () => void;
  onOpenConversation?: (conversationId: string, messageId?: string) => void;
};

/** The detail view for any workspace record. The shell places it in its right panel. */
export function RecordDetail({
  organizationId,
  target,
  onOpenRecord,
  onClose,
  onOpenConversation,
}: RecordDetailProps) {
  const common = { organizationId, onOpenRecord, onClose, onOpenConversation };
  switch (target.kind) {
    case "project":
      return <ProjectDetailView key={target.id} {...common} projectId={target.id} />;
    case "task":
      return (
        <TaskDetailView
          key={target.id}
          {...common}
          taskId={target.id}
          projectId={target.projectId}
        />
      );
    case "contact":
      return <ContactDetailView key={target.id} {...common} contactId={target.id} />;
    case "interaction":
      return <InteractionDetailView key={target.id} {...common} interactionId={target.id} />;
    case "account":
      return <AccountDetailView key={target.id} {...common} accountId={target.id} />;
    case "deal":
      return <DealDetailView key={target.id} {...common} dealId={target.id} />;
  }
}

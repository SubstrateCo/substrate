import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
  messageAttachmentPreviewUrl,
  messageAttachmentUrl,
  type TaskAttachmentTarget,
} from "@/api/files/attachments";
import { RecordSection } from "@/components/layout/record-section";
import { MessageAttachments } from "@/components/messaging/messages/attachments/message-attachments";
import { Button } from "@/components/ui/button";
import { messageLink } from "@/lib/navigation/record-links";
import { taskSourceAttachmentsOptions } from "@/queries/files/attachments";

/**
 * The files of the message the task was created from. They keep the message's access, so the
 * section stays hidden from viewers who cannot open the message.
 */
export function TaskSourceAttachments({
  target,
  visible,
}: {
  target: TaskAttachmentTarget;
  visible: boolean;
}) {
  const query = useQuery({ ...taskSourceAttachmentsOptions(target), enabled: visible });
  const source = query.data?.source;
  if (!source || !query.data?.attachments.length) return null;
  const file = (attachmentId: string) => ({
    organizationId: target.organizationId,
    conversationId: source.conversationId,
    messageId: source.messageId,
    attachmentId,
  });
  return (
    <RecordSection
      aria-label="Source message files"
      title="Source message files"
      description="Only people who can open the source message see these files."
      actions={
        <Button variant="link" size="sm" asChild>
          <Link {...messageLink(target.organizationId, source.conversationId, source.messageId)}>
            Open source message
          </Link>
        </Button>
      }
    >
      <MessageAttachments
        attachments={query.data.attachments}
        href={(attachment) => messageAttachmentUrl(file(attachment.id))}
        previewHref={(attachment) => messageAttachmentPreviewUrl(file(attachment.id))}
      />
    </RecordSection>
  );
}

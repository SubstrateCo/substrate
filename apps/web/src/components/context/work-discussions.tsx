import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { messageHref } from "@/lib/context-links";
import { relatedContextOptions } from "@/queries/context/options";
import { WorkDiscussions as WorkDiscussionsView } from "@/ui/context/work-discussions";

export function WorkDiscussions({
  organizationId,
  entityId,
  label = "Related context",
  children,
}: {
  organizationId: string;
  entityId: string;
  label?: string;
  children?: ReactNode;
}) {
  const related = useQuery(relatedContextOptions(organizationId, entityId));
  return (
    <WorkDiscussionsView
      items={(related.data ?? []).map((item) => ({
        ...item,
        href: messageHref(organizationId, item.conversationId, item.messageId),
      }))}
      loading={related.isPending}
      error={related.error}
      onRetry={() => void related.refetch()}
      label={label}
    >
      {children}
    </WorkDiscussionsView>
  );
}

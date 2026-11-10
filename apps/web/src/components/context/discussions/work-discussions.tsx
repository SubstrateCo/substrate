import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import { WorkDiscussions as WorkDiscussionsView } from "@/components/context/discussions/work-discussions-view";
import { messageHref } from "@/lib/navigation/record-links";
import { relatedContextOptions } from "@/queries/context/links";

export function WorkDiscussions({
  organizationId,
  entityId,
  label,
  variant,
  children,
  visible = true,
}: {
  organizationId: string;
  entityId: string;
  label?: string;
  variant?: "inspector" | "page";
  children?: ReactNode;
  visible?: boolean;
}) {
  const related = useQuery({
    ...relatedContextOptions(organizationId, entityId),
    enabled: visible,
  });
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
      variant={variant}
    >
      {children}
    </WorkDiscussionsView>
  );
}

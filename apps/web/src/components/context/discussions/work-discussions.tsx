import { useQuery } from "@tanstack/react-query";

import type { ReactNode } from "react";

import {
  InspectorDiscussions,
  PageDiscussions,
  type WorkDiscussionsProps,
} from "@/components/context/discussions/work-discussions-view";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { messageLink } from "@/lib/navigation/record-links";
import { resourceState } from "@/lib/resource-state";
import { relatedContextOptions } from "@/queries/context/links";
import { conversationsQueryOptions } from "@/queries/messaging/options";

export function WorkDiscussions({
  entityId,
  label,
  emptyTitle,
  variant,
  children,
  visible = true,
}: {
  entityId: string;
  label?: string;
  emptyTitle?: string;
  variant?: "inspector" | "page";
  children?: ReactNode;
  visible?: boolean;
}) {
  const { organizationId } = useWorkspaceScope();
  const related = useQuery({
    ...relatedContextOptions(organizationId, entityId),
    enabled: visible,
  });
  const conversations = useQuery({
    ...conversationsQueryOptions(organizationId),
    enabled: visible,
  });
  const props: WorkDiscussionsProps = {
    items: (resourceState(related).data ?? []).map((item) => {
      const conversation = conversations.data?.find((entry) => entry.id === item.conversationId);
      return {
        ...item,
        conversationKind: conversation?.kind,
        private: conversation?.private,
        link: messageLink(organizationId, item.conversationId, item.messageId),
      };
    }),
    loading: related.isPending,
    error: related.error,
    onRetry: () => void related.refetch(),
    label,
    children,
  };
  if (variant === "page") return <PageDiscussions {...props} />;
  return <InspectorDiscussions {...props} emptyTitle={emptyTitle} />;
}

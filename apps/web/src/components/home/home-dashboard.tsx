import type { AgentRequestView } from "@substrate/contracts/agent-work";
import { taskStatusLabels } from "@substrate/contracts/tasks";

import { useQuery, type QueryObserverResult } from "@tanstack/react-query";

import { HomeDashboardView } from "./home-dashboard-view";
import type { HomeItem, HomeSectionData } from "./home-section";
import { WorkIndicator } from "@/components/agent-work/work-indicator";
import { notificationPresentation } from "@/components/context/notifications/notification-presentation";
import { ConversationKindIcon } from "@/components/messaging/conversations/conversation-kind-icon";
import { PersonAvatar } from "@/components/people/person-avatar";
import { TaskPriorityIcon } from "@/components/tasks/task-cues/task-priority-icon";
import { TaskStatusIcon } from "@/components/tasks/task-cues/task-status-icon";
import { DueDate } from "@/components/time/due-date";
import { Timestamp } from "@/components/time/timestamp";
import { useOrganizationApps } from "@/components/workspace/organization-apps";
import { useNow } from "@/hooks/use-now";
import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import { needsYouItems } from "@/lib/agent-work/needs-you";
import { agentStatus } from "@/lib/agent-work/status";
import { formatDateOnly, formatShortDate } from "@/lib/format/date";
import { conversationName } from "@/lib/messaging/conversations";
import { agentLink, crmLink, messageLink, workLink } from "@/lib/navigation/record-links";
import { agentStatusOptions, needsYouOptions } from "@/queries/agent-work/server";
import { notificationPreviewOptions } from "@/queries/context/notification-groups";
import { homeDealsOptions } from "@/queries/crm/options";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { unreadCountsOptions } from "@/queries/messaging/read-state";
import { homeTasksOptions } from "@/queries/tasks/options";
import { AtSign, Bell, Hand, Handshake } from "lucide-react";

const conversationKinds = { dm: "Direct message", group: "Group conversation", channel: "Channel" };

function requestTitle(request: AgentRequestView) {
  if (!request.payload) return hiddenConversation;
  if (request.payload.type === "proposal") return request.payload.summary;
  return request.payload.title;
}

export function HomeDashboard({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const now = useNow(true, 60_000);
  const apps = useOrganizationApps();
  const today = formatDateOnly(new Date(now));
  const tasks = useQuery({ ...homeTasksOptions(organizationId), enabled: apps.enabled("tasks") });
  const deals = useQuery({
    ...homeDealsOptions(organizationId, today),
    enabled: apps.enabled("crm"),
  });
  const statuses = useQuery(agentStatusOptions(userId, organizationId));
  const needsYou = useQuery(needsYouOptions(userId, organizationId));
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const unread = useQuery(unreadCountsOptions(organizationId));
  const notifications = useQuery(notificationPreviewOptions(organizationId));
  const groups = (notifications.data?.items ?? []).filter(
    (item) => apps.enabled("tasks") || (!item.projectEntityId && item.kind !== "assignment"),
  );
  const mentions = groups.filter((item) => item.kind === "mention" && item.unreadCount > 0);
  const { requests, agents, calls, desktopUpdateRequired } = needsYouItems(needsYou.data);
  const attentionItems: HomeItem[] = [
    ...requests.map((request): HomeItem => ({
      id: request.id,
      title: requestTitle(request),
      description: `${request.agent.name} · ${request.kind === "question" ? "Needs your answer" : "Needs your approval"}`,
      icon: <Hand className="size-4 text-warning" />,
      link:
        request.place.access === "visible"
          ? messageLink(
              organizationId,
              request.place.conversationId,
              request.place.anchorMessageId ?? undefined,
            )
          : { to: "/agents", search: { workspaceId: organizationId } },
      trailing: "Review",
    })),
    ...calls.map((call): HomeItem => ({
      id: call.id,
      title: `Approve a call to ${call.agent.name}`,
      description: "A caller is waiting for your decision",
      icon: <Hand className="size-4 text-warning" />,
      link: { to: "/agents", search: { workspaceId: organizationId } },
      trailing: "Review",
    })),
    ...agents.map((status): HomeItem => ({
      id: status.userAgentId,
      title: `${status.agent.name} needs you`,
      description: "Work stopped · open activity to decide what happens next",
      icon: <Hand className="size-4 text-warning" />,
      link: agentLink(organizationId, status.userAgentId, "activity"),
      trailing: "Review",
    })),
    ...desktopUpdateRequired.map((status): HomeItem => ({
      id: `update:${status.userAgentId}`,
      title: `${status.agent.name} needs a desktop update`,
      description: "Update the home desktop to run caller calls",
      icon: <Hand className="size-4 text-warning" />,
      link: agentLink(organizationId, status.userAgentId),
    })),
    ...mentions.map((item): HomeItem => ({
      id: item.groupKey,
      title: item.excerpt ?? "You were mentioned",
      description: `${item.actorName ?? "Someone"} · ${item.source.name}`,
      icon: <AtSign className="size-4" />,
      link: notificationPresentation(organizationId, item).link,
      trailing: <Timestamp value={item.createdAt} format="relative" />,
    })),
  ];
  const section = <T,>(
    query: {
      isPending: boolean;
      error: Error | null;
      refetch: () => Promise<QueryObserverResult<T, Error>>;
    },
    items: HomeItem[],
  ): HomeSectionData => ({
    items,
    loading: query.isPending,
    error: query.error,
    onRetry: () => void query.refetch(),
  });
  const visibleAttention = attentionItems.slice(0, 5);
  const attentionIds = new Set(visibleAttention.map((item) => item.id));
  const mentionedConversations = new Set(
    mentions.filter((item) => attentionIds.has(item.groupKey)).map((item) => item.conversationId),
  );
  const unreadById = new Map(
    (unread.data ?? []).map((item) => [item.conversationId, item.unreadCount]),
  );
  const unreadConversations = (conversations.data ?? [])
    .filter(
      (item) =>
        item.joined &&
        !item.task &&
        (unreadById.get(item.id) ?? 0) > 0 &&
        !mentionedConversations.has(item.id),
    )
    .sort((a, b) => Number(b.kind === "dm") - Number(a.kind === "dm"));
  const shownConversations = new Set(unreadConversations.slice(0, 3).map((item) => item.id));
  const shownTasks = new Set((tasks.data ?? []).map((item) => item.entityId));
  return (
    <HomeDashboardView
      organizationId={organizationId}
      tasksEnabled={apps.enabled("tasks")}
      crmEnabled={apps.enabled("crm")}
      date={formatShortDate(now)}
      attention={{
        items: visibleAttention,
        loading: needsYou.isPending || notifications.isPending,
        error: needsYou.error ?? notifications.error,
        onRetry: () => {
          void needsYou.refetch();
          void notifications.refetch();
        },
      }}
      tasks={section(
        tasks,
        (tasks.data ?? []).map((task) => ({
          id: task.entityId,
          title: task.title,
          description: (
            <>
              {task.projectName} · {taskStatusLabels[task.status]}
            </>
          ),
          icon: <TaskStatusIcon status={task.status} />,
          link: workLink(organizationId, task.projectEntityId, task.entityId),
          trailing: (
            <span className="flex items-center gap-3">
              <TaskPriorityIcon priority={task.priority} />
              <DueDate value={task.dueDate} />
            </span>
          ),
        })),
      )}
      agents={section(
        statuses,
        [...(statuses.data ?? [])]
          .sort((a, b) => Number(b.state === "needs_you") - Number(a.state === "needs_you"))
          .slice(0, 3)
          .map((status) => {
            const display = agentStatus(status);
            return {
              id: status.userAgentId,
              title: status.agent.name,
              description: display.label,
              icon: (
                <>
                  <PersonAvatar name={status.agent.name} agent />
                  <WorkIndicator tone={display.tone} compact />
                </>
              ),
              link: agentLink(organizationId, status.userAgentId),
            };
          }),
      )}
      conversations={{
        ...section(
          conversations,
          unreadConversations.slice(0, 3).map((item) => ({
            id: item.id,
            title: conversationName(item),
            description: conversationKinds[item.kind],
            icon: (
              <ConversationKindIcon kind={item.kind} private={item.private} className="size-4" />
            ),
            link: messageLink(organizationId, item.id),
            trailing: `${unreadById.get(item.id)} unread`,
          })),
        ),
        loading: conversations.isPending || unread.isPending,
        error: conversations.error ?? unread.error,
        onRetry: () => {
          void conversations.refetch();
          void unread.refetch();
        },
      }}
      deals={section(
        deals,
        (deals.data ?? []).map((deal) => ({
          id: deal.entityId,
          title: deal.title,
          description: `${deal.stage} · Expected close`,
          icon: <Handshake className="size-4" />,
          link: crmLink(organizationId, "deals", deal.entityId),
          trailing: <DueDate value={deal.expectedCloseDate} />,
        })),
      )}
      updates={section(
        notifications,
        groups
          .filter(
            (item) =>
              !attentionIds.has(item.groupKey) &&
              !(item.conversationId && shownConversations.has(item.conversationId)) &&
              !(item.kind === "assignment" && item.entityId && shownTasks.has(item.entityId)),
          )
          .slice(0, 4)
          .map((item) => ({
            id: item.groupKey,
            title: item.title,
            description: `${item.actorName ?? "Someone"} · ${item.kind === "assignment" ? "Assigned to you" : "New activity"} · ${item.source.name}`,
            icon: <Bell className="size-4" />,
            link: notificationPresentation(organizationId, item).link,
            trailing: <Timestamp value={item.createdAt} format="relative" />,
          })),
      )}
    />
  );
}

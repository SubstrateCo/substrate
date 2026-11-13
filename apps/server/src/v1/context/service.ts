import type {
  contextWorkspace,
  contextEntity,
  contextMessage,
  contextMessagePage,
  contextTarget,
  contextTargets,
  contextLink,
  contextSearch,
  contextSourceTask,
  contextNotification,
  contextNotificationPage,
} from "@substrate/contracts/context/input";
import type {
  notificationGroupsInput,
  notificationGroupEventsInput,
  notificationGroupReadInput,
} from "@substrate/contracts/context/notification-groups";

import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { createCommittedPublisher } from "../realtime/committed";
import type { z } from "zod";

export function createContextService({
  publish,
}: {
  publish: ReturnType<typeof createCommittedPublisher>;
}) {
  return {
    getMessageLinks(this: void, scope: WorkspaceScope, input: z.output<typeof contextMessage>) {
      return serviceResult(() => scope.repositories.context.messageLinks(input.messageId));
    },
    getMessagePage(this: void, scope: WorkspaceScope, input: z.output<typeof contextMessagePage>) {
      return serviceResult(() => scope.repositories.context.messagePage(input.messageIds));
    },
    getMessagePeople(this: void, scope: WorkspaceScope, input: z.output<typeof contextMessage>) {
      return serviceResult(() => scope.repositories.context.messagePeople(input.messageId));
    },
    getRelatedContext(this: void, scope: WorkspaceScope, input: z.output<typeof contextEntity>) {
      return serviceResult(() => scope.repositories.context.related(input.entityId));
    },
    getMessageTarget(this: void, scope: WorkspaceScope, input: z.output<typeof contextTarget>) {
      return serviceResult(() =>
        scope.repositories.context.messageTarget(input.conversationId, input.messageId),
      );
    },
    getMessageTargets(this: void, scope: WorkspaceScope, input: z.output<typeof contextTargets>) {
      return serviceResult(() => scope.repositories.context.messageTargets(input.targets));
    },
    searchContext(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof contextSearch>,
      signal?: AbortSignal,
    ) {
      return serviceResult(() => scope.repositories.context.search(input, signal), signal);
    },
    createTaskFromMessage(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof contextSourceTask>,
    ) {
      return serviceResult(async () =>
        publish(
          await scope.repositories.transaction((repos) =>
            repos.context.createTaskFromMessage(input),
          ),
        ),
      );
    },
    attachWork(this: void, scope: WorkspaceScope, input: z.output<typeof contextLink>) {
      return serviceResult(async () => {
        await publish(
          await scope.repositories.transaction((repos) =>
            repos.context.attach(input.messageId, input.entityId),
          ),
        );
        return null;
      });
    },
    detachWork(this: void, scope: WorkspaceScope, input: z.output<typeof contextLink>) {
      return serviceResult(async () => {
        await publish(
          await scope.repositories.transaction((repos) =>
            repos.context.detach(input.messageId, input.entityId),
          ),
        );
        return null;
      });
    },
    getActivity(this: void, scope: WorkspaceScope, input: z.output<typeof contextEntity>) {
      return serviceResult(() => scope.repositories.feed.activity(input.entityId));
    },
    getNotifications(this: void, scope: WorkspaceScope, _input: z.output<typeof contextWorkspace>) {
      return serviceResult(() => scope.repositories.feed.list());
    },
    getNotificationGroups(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof notificationGroupsInput>,
    ) {
      return serviceResult(() => scope.repositories.feed.groups(input));
    },
    getNotificationGroupEvents(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof notificationGroupEventsInput>,
    ) {
      return serviceResult(() => scope.repositories.feed.groupEvents(input));
    },
    getNotificationUnread(
      this: void,
      scope: WorkspaceScope,
      _input: z.output<typeof contextWorkspace>,
    ) {
      return serviceResult(async () => ({ unread: await scope.repositories.feed.hasUnread() }));
    },
    markNotificationGroupRead(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof notificationGroupReadInput>,
    ) {
      return serviceResult(async () => {
        await publish(await scope.repositories.feed.markGroupRead(input));
        return null;
      });
    },
    getNotificationPage(
      this: void,
      scope: WorkspaceScope,
      input: z.output<typeof contextNotificationPage>,
    ) {
      return serviceResult(async () => {
        const rows = await scope.repositories.feed.list(input.after, {
          limit: input.limit + 1,
          unread: input.filter === "unread",
        });
        const items = rows.slice(0, input.limit);
        return { items, nextCursor: rows.length > input.limit ? items.at(-1)!.id : null };
      });
    },
    markRead(this: void, scope: WorkspaceScope, input: z.output<typeof contextNotification>) {
      return serviceResult(async () => {
        await publish(await scope.repositories.feed.markRead(input.id));
        return null;
      });
    },
    markAllRead(this: void, scope: WorkspaceScope, _input: z.output<typeof contextWorkspace>) {
      return serviceResult(async () => {
        await publish(await scope.repositories.feed.markAllRead());
        return null;
      });
    },
  };
}
export type ContextService = ReturnType<typeof createContextService>;

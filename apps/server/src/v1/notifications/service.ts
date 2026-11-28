import type {
  updateAccountNotificationPreferences,
  updateConversationNotificationPreferences,
  updateWorkspaceNotificationPreferences,
} from "@substrate/contracts/notifications/preferences";

import type { CommittedPublisher } from "../../shared/committed";
import type { UserScope, WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import type { z } from "zod";

export function createNotificationPreferencesService(deps: { publish: CommittedPublisher }) {
  return {
    account(scope: UserScope) {
      return serviceResult(() => scope.owner.notifications.get());
    },
    updateAccount(scope: UserScope, input: z.output<typeof updateAccountNotificationPreferences>) {
      return serviceResult(async () => deps.publish(await scope.owner.notifications.update(input)));
    },
    workspace(scope: WorkspaceScope) {
      return serviceResult(() => scope.repositories.notificationPreferences.workspace());
    },
    updateWorkspace(
      scope: WorkspaceScope,
      input: z.output<typeof updateWorkspaceNotificationPreferences>,
    ) {
      return serviceResult(async () =>
        deps.publish(await scope.repositories.notificationPreferences.updateWorkspace(input)),
      );
    },
    conversation(scope: WorkspaceScope, conversationId: string) {
      return serviceResult(() =>
        scope.repositories.notificationPreferences.conversation(conversationId),
      );
    },
    updateConversation(
      scope: WorkspaceScope,
      conversationId: string,
      input: z.output<typeof updateConversationNotificationPreferences>,
    ) {
      return serviceResult(async () =>
        deps.publish(
          await scope.repositories.notificationPreferences.updateConversation(
            conversationId,
            input,
          ),
        ),
      );
    },
  };
}

export type NotificationPreferencesService = ReturnType<
  typeof createNotificationPreferencesService
>;

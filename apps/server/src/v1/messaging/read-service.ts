import type { conversationReadInput } from "@substrate/contracts/messaging/read-state";

import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { createCommittedPublisher } from "../realtime/committed";
import type { z } from "zod";

export function createReadService(publish: ReturnType<typeof createCommittedPublisher>) {
  return {
    unread(scope: WorkspaceScope) {
      return serviceResult(() => scope.repositories.messaging.unreadCounts());
    },
    markRead(scope: WorkspaceScope, input: z.output<typeof conversationReadInput>) {
      return serviceResult(async () =>
        publish(await scope.repositories.messaging.markRead(input.conversationId, input.messageId)),
      );
    },
  };
}

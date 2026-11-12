import type { CrmFromMessageInput } from "@substrate/contracts/crm/from-message";
import { createCrmFromMessage } from "@substrate/database/crm/from-message";
import type { DatabaseExecutor } from "@substrate/database/trusted";

import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";

export function createCrmFromMessageService(deps: {
  db: DatabaseExecutor;
  publish: CommittedPublisher;
}) {
  return {
    create(scope: WorkspaceScope, input: CrmFromMessageInput) {
      return serviceResult(async () =>
        deps.publish(
          await createCrmFromMessage(
            deps.db,
            {
              userId: scope.userId,
              organizationId: scope.organizationId,
            },
            input,
          ),
        ),
      );
    },
  };
}
export type CrmFromMessageService = ReturnType<typeof createCrmFromMessageService>;

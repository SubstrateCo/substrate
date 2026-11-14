import type { CrmFromMessageInput } from "@substrate/contracts/crm/from-message";

import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";

export function createCrmFromMessageService(deps: { publish: CommittedPublisher }) {
  return {
    create(scope: WorkspaceScope, input: CrmFromMessageInput) {
      return serviceResult(async () =>
        deps.publish(
          await scope.repositories.transaction((repos) => repos.crmFromMessage.create(input)),
        ),
      );
    },
  };
}
export type CrmFromMessageService = ReturnType<typeof createCrmFromMessageService>;

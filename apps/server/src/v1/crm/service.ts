import type { crmActivityList } from "@substrate/contracts/crm/activity";
import type { CrmWrite } from "@substrate/contracts/crm/input";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import { exportCrm } from "./export";
import { createCrmManagementService } from "./management";
import type { z } from "zod";

type List = Parameters<WorkspaceScope["repositories"]["crm"]["listAccounts"]>[0];
export function createCrmService(deps: { publish: CommittedPublisher }) {
  return {
    ...createCrmManagementService(deps),
    export: exportCrm,
    activity: (scope: WorkspaceScope, input: z.output<typeof crmActivityList>) =>
      serviceResult(() =>
        scope.repositories.crm.activity(input.entityId, {
          limit: input.limit,
          before:
            input.beforeCreatedAt && input.beforeId
              ? { createdAt: input.beforeCreatedAt, id: input.beforeId }
              : undefined,
        }),
      ),
    timeline: (
      scope: WorkspaceScope,
      id: string,
      input: Parameters<WorkspaceScope["repositories"]["crm"]["timeline"]>[1],
    ) => serviceResult(() => scope.repositories.crm.timeline(id, input)),
    settings: (scope: WorkspaceScope) => serviceResult(() => scope.repositories.crm.settings()),
    listAccounts: (scope: WorkspaceScope, input: List) =>
      serviceResult(() => scope.repositories.crm.listAccounts(input)),
    getAccount: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.crm.getAccount(id)),
    listDeals: (scope: WorkspaceScope, input: List) =>
      serviceResult(() => scope.repositories.crm.listDeals(input)),
    getDeal: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.crm.getDeal(id)),
    pipeline: (scope: WorkspaceScope) =>
      serviceResult(async () => {
        // ensurePipeline writes only when no stage exists, so read first.
        const stages = await scope.repositories.crm.pipeline();
        if (stages.length) return stages;
        return deps.publish(await scope.repositories.crm.ensurePipeline());
      }),
    followUps: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.crm.followUps(id)),
    report: (
      scope: WorkspaceScope,
      from: string,
      to: string,
      options?: Parameters<WorkspaceScope["repositories"]["crm"]["report"]>[2],
    ) => serviceResult(() => scope.repositories.crm.report(new Date(from), new Date(to), options)),
    reportDeals: (
      scope: WorkspaceScope,
      input: Parameters<WorkspaceScope["repositories"]["crm"]["reportDeals"]>[0],
    ) => serviceResult(() => scope.repositories.crm.reportDeals(input)),
    mutate(scope: WorkspaceScope, input: CrmWrite) {
      return serviceResult(async () =>
        deps.publish(
          await scope.repositories.transaction(async (repos) => {
            switch (input.action) {
              case "assignOwner":
                return repos.crm.assignOwner(input.entityId, input);
              case "updateSettings":
                return repos.crm.updateSettings(input);
              case "createAccount":
                return repos.crm.createAccount(input);
              case "updateAccount":
                return repos.crm.updateAccount(input.entityId, input);
              case "createDeal":
                return repos.crm.createDeal(input);
              case "updateDeal":
                return repos.crm.updateDeal(input.entityId, input.expectedVersion, input);
              case "transitionDeal":
                return repos.crm.transitionDeal(input.entityId, input);
              case "archive":
                await repos.crm.archive(input.entityId, input.archived);
                return { entityId: input.entityId };
              case "createFollowUp":
                return repos.crm.createFollowUp(input);
              case "setAffiliation":
                return repos.crm.setAffiliation(input);
              case "removeAffiliation":
                await repos.crm.removeAffiliation(input.contactEntityId, input.accountEntityId);
                return { entityId: input.contactEntityId };
              case "share":
                return repos.crm.share(input.entityId, input.actorEntityId, input.level);
              case "revoke":
                return repos.crm.revoke(input.entityId, input.actorEntityId);
              case "configureStages":
                return repos.crm.configureStages(input.stages);
            }
          }),
        ),
      );
    },
  };
}
export type CrmService = ReturnType<typeof createCrmService>;

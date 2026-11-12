import type { CrmWrite } from "@substrate/contracts/crm/input";

import type { WorkspaceScope } from "../../shared/scope";
import { serviceResult } from "../../shared/service-result";
import type { CommittedPublisher } from "../realtime/committed";
import { createCrmManagementService } from "./management";

type List = Parameters<WorkspaceScope["repositories"]["crm"]["listAccounts"]>[0];
export function createCrmService(deps: { publish: CommittedPublisher }) {
  return {
    ...createCrmManagementService(),
    activity: (
      scope: WorkspaceScope,
      id: string,
      options?: Parameters<WorkspaceScope["repositories"]["crm"]["activity"]>[1],
    ) => serviceResult(() => scope.repositories.crm.activity(id, options)),
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
    listContacts: (scope: WorkspaceScope, input: List) =>
      serviceResult(() => scope.repositories.crm.listContacts(input)),
    getContact: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.crm.getContact(id)),
    listDeals: (scope: WorkspaceScope, input: List) =>
      serviceResult(() => scope.repositories.crm.listDeals(input)),
    getDeal: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.crm.getDeal(id)),
    pipeline: (scope: WorkspaceScope) =>
      serviceResult(async () => deps.publish(await scope.repositories.crm.ensurePipeline())),
    interactions: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.crm.listInteractions(id)),
    followUps: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.crm.followUps(id)),
    candidates: (
      scope: WorkspaceScope,
      input: Parameters<WorkspaceScope["repositories"]["contacts"]["findByIdentifier"]>[0],
    ) => serviceResult(() => scope.repositories.contacts.findByIdentifier(input)),
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
              case "createContact":
                return repos.crm.createContact(input);
              case "updateContact":
                return repos.crm.updateContact(input.entityId, input);
              case "addIdentifier":
              case "updateIdentifier":
              case "removeIdentifier":
              case "addAddress":
              case "updateAddress":
              case "removeAddress":
              case "addUrl":
              case "updateUrl":
              case "removeUrl":
                return repos.crm.mutateContactDetail(input);
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
              case "createInteraction":
                return repos.crm.createInteraction({
                  ...input,
                  occurredAt: new Date(input.occurredAt),
                  endedAt: input.endedAt ? new Date(input.endedAt) : null,
                });
              case "publishInteraction":
                return repos.crm.publishInteraction(input);
              case "updateInteraction":
                return repos.crm.updateInteraction(input.entityId, input);
              case "deleteInteraction":
                return repos.crm.deleteInteraction(input.entityId);
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

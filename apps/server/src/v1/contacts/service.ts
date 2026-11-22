import type { ContactWrite } from "@substrate/contracts/contacts/input";

import type { CommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import { exportCrm } from "../crm/export";

export function createContactsService(deps: { publish: CommittedPublisher }) {
  return {
    export: exportCrm,
    list: (
      scope: WorkspaceScope,
      input: Parameters<WorkspaceScope["repositories"]["contacts"]["listContacts"]>[0],
    ) => serviceResult(() => scope.repositories.contacts.listContacts(input)),
    get: (scope: WorkspaceScope, id: string) =>
      serviceResult(() => scope.repositories.contacts.getContact(id)),
    candidates: (
      scope: WorkspaceScope,
      input: Parameters<WorkspaceScope["repositories"]["contacts"]["findByIdentifier"]>[0],
    ) => serviceResult(() => scope.repositories.contacts.findByIdentifier(input)),
    mutate: (scope: WorkspaceScope, input: ContactWrite) =>
      serviceResult(async () =>
        deps.publish(
          await scope.repositories.transaction(async (repos) => {
            switch (input.action) {
              case "createContact":
                return repos.contacts.createContact(input);
              case "updateContact":
                return repos.contacts.updateContact(input.entityId, input);
              case "archive":
                return repos.contacts.archive(input.entityId, input.archived);
              case "addIdentifier":
              case "updateIdentifier":
              case "removeIdentifier":
              case "addAddress":
              case "updateAddress":
              case "removeAddress":
              case "addUrl":
              case "updateUrl":
              case "removeUrl":
                return repos.contacts.mutateContactDetail(input);
            }
          }),
        ),
      ),
  };
}
export type ContactsService = ReturnType<typeof createContactsService>;

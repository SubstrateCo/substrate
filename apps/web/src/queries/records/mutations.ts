import type { ContactWrite } from "@substrate/contracts/contacts/input";
import type { InteractionWrite } from "@substrate/contracts/context/interactions";
import type { CrmWrite } from "@substrate/contracts/crm/input";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateRecordWrite } from "./invalidation";
import { mutateContact } from "@/api/contacts/requests";
import { mutateInteraction } from "@/api/context/interactions";
import { mutateCrm } from "@/api/crm/requests";

export type RecordWrite = ContactWrite | CrmWrite | InteractionWrite;

// Shared record editors also expose CRM relationships and context actions.
export function useRecordMutation(organizationId: string, kind: "accounts" | "contacts" | "deals") {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (data: RecordWrite) => {
      switch (data.action) {
        case "createContact":
        case "updateContact":
        case "addIdentifier":
        case "updateIdentifier":
        case "removeIdentifier":
        case "addAddress":
        case "updateAddress":
        case "removeAddress":
        case "addUrl":
        case "updateUrl":
        case "removeUrl":
          return mutateContact({ data });
        case "createInteraction":
        case "updateInteraction":
        case "deleteInteraction":
        case "publishInteraction":
          return mutateInteraction({ data });
        case "archive":
          return kind === "contacts" ? mutateContact({ data }) : mutateCrm({ data });
        case "assignOwner":
        case "configureStages":
        case "createAccount":
        case "createDeal":
        case "createFollowUp":
        case "removeAffiliation":
        case "revoke":
        case "setAffiliation":
        case "share":
        case "transitionDeal":
        case "updateAccount":
        case "updateDeal":
        case "updateSettings":
          return mutateCrm({ data });
      }
    },
    onSuccess: () => invalidateRecordWrite(client, organizationId),
  });
}

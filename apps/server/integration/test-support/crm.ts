import type { contactWrite } from "@substrate/contracts/contacts/input";
import type { interactionWrite } from "@substrate/contracts/context/interactions";
import type { crmWrite } from "@substrate/contracts/crm/input";

import { result, type WorkspaceClient } from "./api";
import { appOrigin } from "./environment";
import { expect } from "@playwright/test";
import type { z } from "zod";

type Input =
  | z.input<typeof crmWrite>
  | z.input<typeof contactWrite>
  | z.input<typeof interactionWrite>;
export type CrmMutation<T = Input> = T extends Input ? Omit<T, "organizationId"> : never;

export function writeCrm(actor: WorkspaceClient, data: CrmMutation, origin = appOrigin) {
  return actor.request.post(recordMutationPath(data.action), {
    headers: { origin },
    data: { ...data, organizationId: actor.organizationId },
  });
}

export function recordMutationPath(action: Input["action"]) {
  switch (action) {
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
      return "/api/v1/contacts/mutations";
    case "createInteraction":
    case "updateInteraction":
    case "deleteInteraction":
    case "publishInteraction":
      return "/api/v1/context/interactions/mutations";
    case "archive":
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
      return "/api/v1/crm/mutations";
  }
}

export async function createCrm(actor: WorkspaceClient, data: CrmMutation) {
  const response = await writeCrm(actor, data);
  expect(response.ok(), `${data.action}: ${response.status()} ${await response.text()}`).toBe(true);
  return result<{ entityId: string }>(response);
}

export function readCrm(
  actor: WorkspaceClient,
  path:
    | "accounts"
    | "contacts"
    | "deals"
    | "account"
    | "contact"
    | "deal"
    | "pipeline"
    | "settings"
    | "interactions",
  params: Record<string, string> = {},
) {
  let endpoint = `/api/v1/crm/${path}`;
  if (path === "contacts") endpoint = "/api/v1/contacts";
  else if (path === "contact") endpoint = "/api/v1/contacts/record";
  else if (path === "interactions") endpoint = "/api/v1/context/interactions";
  return actor.request.get(endpoint, {
    params: { ...params, organizationId: actor.organizationId },
  });
}

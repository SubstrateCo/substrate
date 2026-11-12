import type { crmWrite } from "@substrate/contracts/crm/input";

import { result, type WorkspaceClient } from "./api";
import { appOrigin } from "./environment";
import { expect } from "@playwright/test";
import type { z } from "zod";

type Input = z.input<typeof crmWrite>;
export type CrmMutation<T = Input> = T extends Input ? Omit<T, "organizationId"> : never;

export function writeCrm(actor: WorkspaceClient, data: CrmMutation, origin = appOrigin) {
  return actor.request.post("/api/v1/crm/mutations", {
    headers: { origin },
    data: { ...data, organizationId: actor.organizationId },
  });
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
  return actor.request.get(`/api/v1/crm/${path}`, {
    params: { ...params, organizationId: actor.organizationId },
  });
}

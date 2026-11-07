import type { ServiceResult } from "@startup-os/contracts/result";
import type { TaskStatus } from "@startup-os/contracts/tasks";

import { expect, type Page } from "@playwright/test";

type Mutation =
  | { action: "createProject"; name: string }
  | {
      action: "createTask";
      projectEntityId: string;
      title: string;
      description?: string;
      parentTaskEntityId?: string;
      status?: TaskStatus;
    }
  | { action: "comment"; projectEntityId: string; taskEntityId: string; body: string };

export async function callTasks<T>(page: Page, input: Mutation) {
  const result: ServiceResult<T> = await page.evaluate(async (input) => {
    const session = await (await fetch("/api/v1/session")).json();
    return (
      await fetch("/api/v1/tasks/mutations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          organizationId: session.data.session.activeOrganizationId,
        }),
      })
    ).json();
  }, input);
  expect(result.success, "The task fixture mutation succeeds").toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

import { failure } from "@startup-os/contracts/result";

import { listProjects, getProject, listTaskComments, mutateTasks } from "./service";
import { expect, test } from "bun:test";

test("task services return invalid-input results before authentication", async () => {
  const headers = new Headers();
  for (const result of await Promise.all([
    listProjects(headers, { organizationId: "" }),
    getProject(headers, { organizationId: "org", projectEntityId: "invalid" }),
    listTaskComments(headers, {
      organizationId: "org",
      projectEntityId: "invalid",
      taskEntityId: "invalid",
    }),
  ]))
    expect(result).toEqual(failure("INVALID_INPUT", "Invalid request input."));
});

test("task writes return a typed origin failure rather than throwing", async () => {
  expect(
    await mutateTasks(new Headers({ origin: "https://foreign.test" }), {
      organizationId: "org",
      action: "createProject",
      name: "Launch",
    }),
  ).toEqual(failure("FORBIDDEN", "Invalid request origin."));
});

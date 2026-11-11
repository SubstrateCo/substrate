import { scopeFixture } from "../../test-support";
import { createTasksService } from "./service";
import { expect, mock, test } from "bun:test";

test("project detail provisions the session owner's agents and returns only the scoped detail", async () => {
  const scope = scopeFixture();
  const projectEntityId = crypto.randomUUID();
  const ensureOwnedAgentActors = mock(async () => {});
  const getDetail = mock(async () => {
    throw new Error("private persistence failure");
  });
  scope.repositories = {
    ...scope.repositories,
    projects: { ...scope.repositories.projects, getDetail },
  };
  const service = createTasksService({
    ensureOwnedAgentActors,
    publish: async (committed) => committed.result,
  });
  expect(
    await service.getProject(scope, { organizationId: scope.organizationId, projectEntityId }),
  ).toEqual({
    success: false,
    error: { code: "INTERNAL_ERROR", message: "The operation is unavailable. Please try again." },
  });
  expect(ensureOwnedAgentActors).toHaveBeenCalledWith({
    userId: scope.userId,
    organizationId: scope.organizationId,
  });
  expect(getDetail).toHaveBeenCalledWith(projectEntityId);
});

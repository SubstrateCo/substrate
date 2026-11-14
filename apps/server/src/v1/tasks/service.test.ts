import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { createCommittedPublisher } from "../../shared/committed";
import { scopeFixture } from "../../test-support";
import { createTasksService } from "./service";
import { expect, mock, test } from "bun:test";

test("discussion resolution publishes its hints and returns the conversation ID", async () => {
  const scope = scopeFixture();
  const projectEntityId = crypto.randomUUID();
  const taskEntityId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const hints: RealtimeHint[] = [
    { audience: realtimeKeys.conversation(conversationId), domain: "messaging" },
  ];
  const ensureDiscussion = mock(async () => ({ result: conversationId, hints }));
  const publish = mock(async (_hints: RealtimeHint[]) => {});
  scope.repositories = {
    ...scope.repositories,
    tasks: { ...scope.repositories.tasks, ensureDiscussion },
  };
  const service = createTasksService({
    ensureOwnedAgentActors: async () => {},
    publish: createCommittedPublisher({ publish, sharingMail: { trigger: () => {} } }),
  });
  expect(
    await service.ensureDiscussion(scope, {
      organizationId: scope.organizationId,
      projectEntityId,
      taskEntityId,
    }),
  ).toEqual({ success: true, data: { conversationId } });
  expect(ensureDiscussion).toHaveBeenCalledWith(taskEntityId, projectEntityId);
  expect(publish).toHaveBeenCalledWith(hints);
});

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

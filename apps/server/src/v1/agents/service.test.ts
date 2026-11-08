import { ServiceError } from "../../shared/service-result";
import { createAgentService } from "./service";
import { expect, mock, test } from "bun:test";

const input = {
  name: "Helper",
  instructions: "Help",
  harness: "opencode" as const,
  enabled: true,
  useStartupDefaults: true,
};
const headers = new Headers();

test("requires an authenticated verified user for reads and writes", async () => {
  for (const [user, code] of [
    [null, "UNAUTHENTICATED"],
    [{ id: "alice", emailVerified: false }, "FORBIDDEN"],
  ] as const) {
    const forUser = mock(() => {
      throw new Error("Persistence must not be reached.");
    });
    const service = createAgentService({
      getSession: async () => (user ? { user } : null),
      forUser,
      changed: async () => {},
      requireOrigin: () => {},
    });
    for (const result of [
      await service.listAgents(headers),
      await service.saveAgent(headers, input),
      await service.setAgentPicture(headers, { id: crypto.randomUUID(), fileId: null }),
    ]) {
      expect(result).toMatchObject({ success: false, error: { code } });
    }
    expect(forUser).not.toHaveBeenCalled();
  }
});

test("all mutations enforce origin and do not reach persistence on failure", async () => {
  const forUser = mock(() => {
    throw new Error("Persistence must not be reached.");
  });
  const service = createAgentService({
    getSession: async () => ({ user: { id: "alice", emailVerified: true } }),
    forUser,
    changed: async () => {},
    requireOrigin: () => {
      throw new ServiceError("FORBIDDEN", "Invalid request origin.");
    },
  });
  const id = crypto.randomUUID();
  const results = await Promise.all([
    service.saveAgent(headers, input),
    service.deleteAgent(headers, { id }),
    service.setAgentPicture(headers, { id, fileId: null }),
  ]);
  for (const result of results)
    expect(result).toEqual({
      success: false,
      error: { code: "FORBIDDEN", message: "Invalid request origin." },
    });
  expect(forUser).not.toHaveBeenCalled();
});

test("derives user identity without requiring an active organization", async () => {
  const catalog = { agents: [] };
  const repository = {
    list: async () => catalog,
    saveAgent: async () => {
      throw new Error("Unexpected save.");
    },
    deleteAgent: async () => null,
    setPicture: async () => {
      throw new Error("Unexpected picture update.");
    },
  };
  const forUser = mock(() => repository);
  const service = createAgentService({
    getSession: async () => ({ user: { id: "solo", emailVerified: true } }),
    forUser,
    changed: async () => {},
    requireOrigin: () => {},
  });
  expect(await service.listAgents(headers)).toEqual({ success: true, data: catalog });
  expect(forUser).toHaveBeenCalledWith("solo");
});

test("picture updates use the verified session owner and return the updated configuration", async () => {
  const id = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  const configuration = {
    ...input,
    id,
    image: `/api/v1/files/${fileId}/content`,
    useStartupDefaults: true,
  };
  const setPicture = mock(async () => configuration);
  const forUser = mock(() => ({
    list: async () => ({ agents: [] }),
    saveAgent: async () => configuration,
    deleteAgent: async () => null,
    setPicture,
  }));
  const service = createAgentService({
    getSession: async () => ({ user: { id: "alice", emailVerified: true } }),
    forUser,
    changed: async () => {},
    requireOrigin: () => {},
  });
  expect(await service.setAgentPicture(headers, { id, fileId })).toEqual({
    success: true,
    data: configuration,
  });
  expect(forUser).toHaveBeenCalledWith("alice");
  expect(setPicture).toHaveBeenCalledWith(id, fileId);
});

test("publishes only after persistence succeeds, never for a rolled-back mutation", async () => {
  const saved = { ...input, id: crypto.randomUUID(), image: null, useStartupDefaults: true };
  const commit = Promise.withResolvers<typeof saved>();
  const published: string[] = [];
  const service = createAgentService({
    getSession: async () => ({ user: { id: "alice", emailVerified: true } }),
    requireOrigin: () => {},
    changed: async (userId) => {
      published.push(userId);
    },
    forUser: () => ({
      list: async () => ({ agents: [] }),
      saveAgent: () => commit.promise,
      setPicture: async () => saved,
      deleteAgent: async () => {
        throw new ServiceError("FORBIDDEN", "Cannot delete.");
      },
    }),
  });
  const saving = service.saveAgent(headers, input);
  await Bun.sleep(0);
  expect(published).toEqual([]);
  commit.resolve(saved);
  expect(await saving).toEqual({ success: true, data: saved });
  const afterCommit = published.slice();
  expect(afterCommit).toEqual(["alice"]);
  expect(await service.deleteAgent(headers, { id: saved.id })).toMatchObject({ success: false });
  const afterRollback = published.slice();
  expect(afterRollback).toEqual(["alice"]);
});

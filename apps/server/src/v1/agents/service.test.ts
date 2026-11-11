import type { Committed } from "@substrate/database";

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
      publish: async (committed) => committed.result,
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
    publish: async (committed) => committed.result,
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
      error: {
        code: "FORBIDDEN",
        message: "Invalid request origin.",
        userMessage: "Invalid request origin.",
      },
    });
  expect(forUser).not.toHaveBeenCalled();
});

test("derives user identity without requiring an active organization", async () => {
  const catalog = { agents: [], runSettings: [] };
  const repository = {
    list: async () => catalog,
    saveAgent: async () => {
      throw new Error("Unexpected save.");
    },
    deleteAgent: async () => ({ result: null, hints: [] }),
    setPicture: async () => {
      throw new Error("Unexpected picture update.");
    },
    setHomeDevice: async () => ({ result: null, hints: [] }),
    saveTriggers: async () => ({ result: null, hints: [] }),
  };
  const forUser = mock(() => repository);
  const service = createAgentService({
    getSession: async () => ({ user: { id: "solo", emailVerified: true } }),
    forUser,
    publish: async (committed) => committed.result,
    requireOrigin: () => {},
  });
  expect(await service.listAgents(headers)).toEqual({ success: true, data: catalog });
  expect(forUser).toHaveBeenCalledWith("solo", undefined);
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
  const setPicture = mock(async () => ({ result: configuration, hints: [] }));
  const forUser = mock(() => ({
    list: async () => ({ agents: [], runSettings: [] }),
    setHomeDevice: async () => ({ result: null, hints: [] }),
    saveTriggers: async () => ({ result: null, hints: [] }),
    saveAgent: async () => ({ result: configuration, hints: [] }),
    deleteAgent: async () => ({ result: null, hints: [] }),
    setPicture,
  }));
  const service = createAgentService({
    getSession: async () => ({ user: { id: "alice", emailVerified: true } }),
    forUser,
    publish: async (committed) => committed.result,
    requireOrigin: () => {},
  });
  expect(await service.setAgentPicture(headers, { id, fileId })).toEqual({
    success: true,
    data: configuration,
  });
  expect(forUser).toHaveBeenCalledWith("alice", undefined);
  expect(setPicture).toHaveBeenCalledWith(id, fileId);
});

test("publishes only after persistence succeeds, never for a rolled-back mutation", async () => {
  const saved = { ...input, id: crypto.randomUUID(), image: null, useStartupDefaults: true };
  const commit = Promise.withResolvers<Committed<typeof saved>>();
  const published: string[] = [];
  const service = createAgentService({
    getSession: async () => ({ user: { id: "alice", emailVerified: true } }),
    requireOrigin: () => {},
    publish: async (committed) => {
      published.push(...committed.hints.map((hint) => hint.domain));
      return committed.result;
    },
    forUser: () => ({
      list: async () => ({ agents: [], runSettings: [] }),
      setHomeDevice: async () => ({ result: null, hints: [] }),
      saveTriggers: async () => ({ result: null, hints: [] }),
      saveAgent: () => commit.promise,
      setPicture: async () => ({ result: saved, hints: [] }),
      deleteAgent: async () => {
        throw new ServiceError("FORBIDDEN", "Cannot delete.");
      },
    }),
  });
  const saving = service.saveAgent(headers, input);
  await Bun.sleep(0);
  expect(published).toEqual([]);
  commit.resolve({ result: saved, hints: [{ audience: ["user", "alice"], domain: "agents" }] });
  expect(await saving).toEqual({ success: true, data: saved });
  const afterCommit = published.slice();
  expect(afterCommit).toEqual(["agents"]);
  expect(await service.deleteAgent(headers, { id: saved.id })).toMatchObject({ success: false });
  const afterRollback = published.slice();
  expect(afterRollback).toEqual(["agents"]);
});

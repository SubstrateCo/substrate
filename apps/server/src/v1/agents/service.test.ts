import { ServiceError } from "../../shared/service-result";
import { createAgentService } from "./service";
import { expect, mock, test } from "bun:test";

const input = { name: "Helper", instructions: "Help", harness: "opencode" as const, enabled: true };
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
    requireOrigin: () => {},
  });
  expect(await service.setAgentPicture(headers, { id, fileId })).toEqual({
    success: true,
    data: configuration,
  });
  expect(forUser).toHaveBeenCalledWith("alice");
  expect(setPicture).toHaveBeenCalledWith(id, fileId);
});

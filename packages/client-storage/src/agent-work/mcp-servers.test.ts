import { maxHarnessMcpServers, type HarnessMcpServer } from "@substrate/contracts/harness";

import { openTestStore } from "./test-support.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

const local: HarnessMcpServer = {
  id: "local-tools",
  name: "Local tools",
  transport: "stdio",
  command: "node",
  args: ["tools.mjs"],
  environment: { LOG_LEVEL: "debug" },
};
const remote: HarnessMcpServer = {
  id: "remote",
  name: "Remote",
  transport: "http",
  url: "https://tools.example/mcp",
};

test("servers belong to one agent of one organization", async () => {
  const { store } = fixture;
  await store.mcpServers.save("org-1", "agent-1", local, 1);
  await store.mcpServers.save("org-1", "agent-1", remote, 2);
  expect(await store.mcpServers.list("org-1", "agent-1")).toEqual([local, remote]);
  expect(await store.mcpServers.list("org-1", "agent-2")).toEqual([]);
  expect(await store.mcpServers.list("org-2", "agent-1")).toEqual([]);
  await store.mcpServers.delete("org-2", "agent-1", local.id);
  expect(await store.mcpServers.list("org-1", "agent-1")).toHaveLength(2);
});

test("saving an existing ID replaces the server and keeps its position", async () => {
  const { store } = fixture;
  await store.mcpServers.save("org-1", "agent-1", local, 1);
  await store.mcpServers.save("org-1", "agent-1", remote, 2);
  const replaced: HarnessMcpServer = {
    id: local.id,
    name: "Moved",
    transport: "http",
    url: "https://moved.example/mcp",
  };
  await store.mcpServers.save("org-1", "agent-1", replaced, 3);
  expect(await store.mcpServers.list("org-1", "agent-1")).toEqual([replaced, remote]);
  await store.mcpServers.delete("org-1", "agent-1", local.id);
  expect(await store.mcpServers.list("org-1", "agent-1")).toEqual([remote]);
});

test("credentials and the reserved Substrate ID are rejected", async () => {
  const { store } = fixture;
  for (const server of [
    { ...local, environment: { API_KEY: "value" } },
    { ...local, args: ["--token=abc"] },
    { ...local, args: ["Bearer abc"] },
    { ...remote, url: "https://user:password@tools.example/mcp" },
    { ...remote, url: "https://tools.example/mcp?key=abc" },
    { ...local, id: "substrate" },
  ])
    await rejects(store.mcpServers.save("org-1", "agent-1", server, 1));
  expect(await store.mcpServers.list("org-1", "agent-1")).toEqual([]);
});

test("an agent keeps at most the maximum number of servers", async () => {
  const { store } = fixture;
  for (let index = 0; index < maxHarnessMcpServers; index++)
    await store.mcpServers.save("org-1", "agent-1", { ...remote, id: `server-${index}` }, index);
  await rejects(store.mcpServers.save("org-1", "agent-1", { ...remote, id: "one-more" }, 100));
  // Replacing an existing server stays possible at the limit.
  await store.mcpServers.save(
    "org-1",
    "agent-1",
    { ...remote, id: "server-0", name: "First" },
    101,
  );
  expect(await store.mcpServers.list("org-1", "agent-1")).toHaveLength(maxHarnessMcpServers);
});

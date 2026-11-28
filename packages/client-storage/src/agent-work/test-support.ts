import { AgentWorkStore } from "./store.ts";
import type { NewTurnRun } from "./turn-runs.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function openTestStore() {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "agent-work-store-"));
  const path = join(root, "agent-work.sqlite");
  const store = await AgentWorkStore.open(path);
  return {
    store,
    path,
    async cleanup() {
      store.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export function turnRun(overrides: Partial<NewTurnRun> = {}): NewTurnRun {
  return {
    turnId: crypto.randomUUID(),
    attempt: 1,
    sessionId: crypto.randomUUID(),
    userAgentId: "agent-1",
    epoch: 0,
    envelope: "<turn></turn>",
    prefixHash: "hash",
    ...overrides,
  };
}

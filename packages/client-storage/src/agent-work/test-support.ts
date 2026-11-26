import { AgentWorkStore } from "./store.ts";
import type { NewTurnRun } from "./turn-runs.ts";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A store on a new SQLite file. Call cleanup when the test ends. */
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

/** A turn attempt of a new server session. */
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

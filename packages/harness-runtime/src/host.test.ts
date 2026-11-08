import { createHarnessHost } from "./host.ts";
import { createMemoryStorage } from "./test-support.ts";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("host uses caller-owned storage without creating a database", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "harness-storage-test-"));
  const host = await createHarnessHost({ accountDirectory: root, storage: createMemoryStorage() });
  try {
    await host.configure({ organizationId: "org-a", agents: [] });
    expect(await readdir(root)).not.toContain(".startup-os");
  } finally {
    await host.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

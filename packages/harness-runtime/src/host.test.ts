import { createHarnessHost } from "./host.ts";
import { createMemoryStorage } from "./test-support.ts";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("host uses caller-owned storage without creating a database", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "harness-storage-test-"));
  const storage = createMemoryStorage();
  const configuration = { organizationId: "org-a", agents: [] };
  const host = await createHarnessHost({ accountDirectory: root, storage });
  try {
    await host.configure(configuration);
    expect(await storage.configuration("org-a")).toEqual(configuration);
    expect(await readdir(root)).not.toContain(".startup-os");
    await host.dispose();
    await storage.configure({ ...configuration, organizationId: "org-b" });
    expect(await storage.configuration("org-b")).toEqual({
      ...configuration,
      organizationId: "org-b",
    });
  } finally {
    await host.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

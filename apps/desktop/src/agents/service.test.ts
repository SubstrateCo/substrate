import type { RealtimeDomain, RealtimeUpdate } from "@startup-os/contracts/realtime";

import { createAgentWorkService } from "./service.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable deslop/no-unknown-parameters -- The fake backend answers with untyped JSON bodies, as the real one does. */

const backend = "https://api.example.com";

function change(domain: RealtimeDomain): RealtimeUpdate {
  return {
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: "org-1",
    domain,
  };
}

async function settle() {
  for (let index = 0; index < 40; index++) await new Promise((resolve) => setTimeout(resolve, 0));
}

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

/** The service on a real store with a fake backend that counts requests per path. */
async function serviceFixture() {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "agent-work-service-"));
  const requests: string[] = [];
  /** Paths that answer UNAUTHENTICATED once, as when the session ended. */
  const deniedOnce = new Set<string>();
  const ok = (data: unknown) => Response.json({ success: true, data });
  const service = createAgentWorkService({
    backend,
    installationId: "00000000-0000-4000-8000-0000000000d1",
    device: { name: "Laptop", platform: "win32" },
    accountsDirectory: root,
    notify: () => {},
    harness: {
      synchronize: async () => {},
      execute: async () => {
        throw new Error("No harness in this test.");
      },
      closeOrganization: async () => {},
      readProfile: async () => "",
    },
    async fetchAPI(url) {
      const path = new URL(url).pathname;
      requests.push(path);
      if (deniedOnce.delete(path))
        return Response.json(
          { success: false, error: { code: "UNAUTHENTICATED", message: "Sign in." } },
          { status: 401 },
        );
      if (path === "/api/v1/session")
        return ok({
          user: { id: "user-1", emailVerified: true },
          session: { activeOrganizationId: "org-1" },
        });
      if (path === "/api/auth/organization/get-active-member-role")
        return Response.json({ role: "owner" });
      if (path === "/api/v1/agents/list") return ok({ agents: [], runSettings: [] });
      if (path === "/api/v1/agent-work/needs-you") return ok({ requests: [] });
      if (path.endsWith("/wakes/pull") || path.endsWith("/requests/answers")) return ok([]);
      return ok(null);
    },
  });
  cleanup = async () => {
    service.stop();
    await rm(root, { recursive: true, force: true });
  };
  return {
    service,
    deniedOnce,
    sessionChecks: () => requests.filter((path) => path === "/api/v1/session").length,
    memberChecks: () =>
      requests.filter((path) => path === "/api/auth/organization/get-active-member-role").length,
  };
}

test("agent work reuses the verified session until a session, access or organization hint or ready", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  await settle();
  expect(f.sessionChecks()).toBe(1);

  // Renderer reads and agent-work hints use the session that was already verified.
  for (let index = 0; index < 3; index++) {
    await f.service.call("agents");
    f.service.onRealtime(change("agent-work"));
  }
  await settle();
  expect(f.sessionChecks()).toBe(1);

  for (const domain of ["session", "access", "organization"] as const) {
    f.service.onRealtime(change(domain));
    await f.service.call("agents");
  }
  f.service.onRealtime({ version: 1, type: "ready" });
  await f.service.call("agents");
  await settle();
  expect(f.sessionChecks()).toBe(5);
  expect(f.memberChecks()).toBe(5);
});

test("a server call denied with UNAUTHENTICATED verifies the session again", async () => {
  const f = await serviceFixture();
  f.service.start();
  await f.service.call("agents");
  await settle();
  expect(f.sessionChecks()).toBe(1);

  f.deniedOnce.add("/api/v1/agent-work/device/wakes/pull");
  f.service.onRealtime(change("agent-work"));
  // Agent-work hints pull after a short window.
  await new Promise((resolve) => setTimeout(resolve, 500));
  await settle();
  expect(f.deniedOnce.size).toBe(0);
  await f.service.call("agents");
  expect(f.sessionChecks()).toBe(2);
});

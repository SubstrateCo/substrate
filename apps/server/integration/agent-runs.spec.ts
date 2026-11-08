import { provisionVerifiedAccount } from "./test-support/auth";
import { Mailpit } from "./test-support/mailpit";
import { provisionWorkspaceSession } from "./test-support/organizations";
import { expect, test } from "@playwright/test";

const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").origin;

test("an owner's DM queues a run that only the owner's home desktop can claim and see", async ({
  playwright,
}) => {
  const owner = await playwright.request.newContext({ baseURL: origin });
  const other = await playwright.request.newContext({ baseURL: origin });
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    const suffix = crypto.randomUUID();
    for (const [request, name] of [
      [owner, "owner"],
      [other, "other"],
    ] as const) {
      await provisionVerifiedAccount({ request }, new Mailpit(request), {
        name,
        email: `${name}-${suffix}@example.test`,
        password: `Runs-${suffix}!`,
      });
    }
    const workspace = await provisionWorkspaceSession(owner, "Runs", `runs-${suffix}`);
    const installationId = crypto.randomUUID();
    const device = { "x-startup-os-installation": installationId, origin };
    expect(
      (
        await owner.post("/api/v1/agent-runs/device/register", {
          headers: { origin },
          data: { installationId, name: "Laptop", platform: "win32" },
        })
      ).ok(),
    ).toBe(true);
    const saved = await owner.post("/api/v1/agents/actors/save", {
      headers: device,
      data: { name: "Research", instructions: "Help", harness: "claude", enabled: true },
    });
    const agentId: string = (await saved.json()).data.id;
    const catalog = await (await owner.post("/api/v1/agents/list", { headers: device })).json();
    expect(catalog.data.runSettings[0]).toMatchObject({
      agentId,
      homeDevice: { name: "Laptop", current: true },
    });

    const dm = await owner.post("/api/v1/messaging/conversations", {
      headers: { origin },
      data: { organizationId: workspace.id, kind: "dm", agentIds: [agentId] },
    });
    const conversationId: string = (await dm.json()).data.id;
    const sent = await owner.post("/api/v1/messaging/messages", {
      headers: { origin },
      data: { organizationId: workspace.id, conversationId, body: "Check the build" },
    });
    expect(sent.ok()).toBe(true);
    expect(await sent.json()).not.toHaveProperty("data.agentRunsQueued");

    const claimInput = { organizationId: workspace.id, installationId };
    expect(
      (
        await anonymous.post("/api/v1/agent-runs/device/claim", {
          headers: { origin },
          data: claimInput,
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await owner.post("/api/v1/agent-runs/device/claim", {
          headers: { origin: "https://evil.example" },
          data: claimInput,
        })
      ).status(),
    ).toBe(403);
    // The other person has no such device, so their session cannot act as it.
    expect(
      (
        await other.post("/api/v1/agent-runs/device/claim", {
          headers: { origin },
          data: claimInput,
        })
      ).status(),
    ).toBe(403);
    const claimed = await owner.post("/api/v1/agent-runs/device/claim", {
      headers: { origin },
      data: claimInput,
    });
    const [run] = (await claimed.json()).data;
    expect(run.prompt).toContain("Check the build");

    const query = `organizationId=${workspace.id}&conversationId=${conversationId}`;
    const listed = await (await owner.get(`/api/v1/agent-runs/conversation?${query}`)).json();
    expect(
      listed.data.map((item: { id: string; status: string }) => [item.id, item.status]),
    ).toEqual([[run.id, "running"]]);
    expect(
      (
        await other.get(`/api/v1/agent-runs/run?organizationId=${workspace.id}&runId=${run.id}`)
      ).status(),
    ).toBe(403);
    expect(
      (
        await owner.post("/api/v1/agent-runs/cancel", {
          headers: { origin },
          data: { organizationId: workspace.id, runId: run.id },
        })
      ).ok(),
    ).toBe(true);
  } finally {
    await Promise.all([owner.dispose(), other.dispose(), anonymous.dispose()]);
  }
});

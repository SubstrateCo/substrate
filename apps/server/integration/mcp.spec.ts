import { provisionVerifiedAccount } from "./test-support/auth";
import { appOrigin } from "./test-support/environment";
import { Mailpit } from "./test-support/mailpit";
import { provisionWorkspaceSession } from "./test-support/organizations";
import { expect, test } from "@playwright/test";

const origin = appOrigin;

test("MCP calls require a verified owner, active workspace, trusted origin and strict tool input", async ({
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
        password: `Mcp-${suffix}!`,
      });
    }
    const workspace = await provisionWorkspaceSession(owner, "MCP", `mcp-${suffix}`);
    const otherWorkspace = await provisionWorkspaceSession(other, "Other", `other-${suffix}`);
    const saved = await owner.post("/api/v1/agents/actors/save", {
      headers: { origin },
      data: { name: "Research", instructions: "Help", harness: "opencode", enabled: true },
    });
    expect(saved.ok()).toBe(true);
    const agentId: string = (await saved.json()).data.id;
    // The desktop host attaches the turn to every call. A routine turn has no source message.
    const turn = {
      turnId: crypto.randomUUID(),
      attempt: 1,
      sessionKey: `routine:${crypto.randomUUID()}`,
      origin: null,
      kind: "unattended",
    };
    const data = { organizationId: workspace.id, agentId, tool: "list_projects", input: {}, turn };
    const { turn: _turn, ...withoutTurn } = data;
    expect(
      (await owner.post("/api/v1/mcp/call", { headers: { origin }, data: withoutTurn })).status(),
    ).toBe(400);
    const valid = await owner.post("/api/v1/mcp/call", { headers: { origin }, data });
    expect(valid.ok()).toBe(true);
    expect(await valid.json()).toEqual({ success: true, data: { items: [], nextCursor: null } });
    expect((await anonymous.post("/api/v1/mcp/call", { headers: { origin }, data })).status()).toBe(
      401,
    );
    expect(
      (
        await owner.post("/api/v1/mcp/call", { headers: { origin: "https://evil.example" }, data })
      ).status(),
    ).toBe(403);
    expect(
      (
        await other.post("/api/v1/mcp/call", {
          headers: { origin },
          data: { ...data, organizationId: otherWorkspace.id },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await owner.post("/api/v1/mcp/call", {
          headers: { origin },
          data: { ...data, organizationId: otherWorkspace.id },
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await owner.post("/api/v1/mcp/call", {
          headers: { origin },
          data: { ...data, input: { actorEntityId: crypto.randomUUID() } },
        })
      ).status(),
    ).toBe(400);
    expect(
      (
        await owner.post("/api/v1/mcp/call", {
          headers: { origin },
          data: { ...data, tool: "request_http" },
        })
      ).status(),
    ).toBe(400);
  } finally {
    await Promise.all([owner.dispose(), other.dispose(), anonymous.dispose()]);
  }
});

import { createAgentWorkServer } from "./agent-work-server.ts";
import { expect, test } from "bun:test";
import { z } from "zod";

test("wake pulls declare support for caller wakes", async () => {
  const bodies: string[] = [];
  const server = createAgentWorkServer({
    backend: "https://api.example.test",
    installationId: "desktop",
    catalog: async () => ({ agents: [], runSettings: [] }),
    fetchAPI: async (_url, init) => {
      bodies.push(z.string().parse(init.body));
      return Response.json({ success: true, data: [] });
    },
  });
  await server.pullWakes("organization", 50);
  expect(JSON.parse(bodies[0]!)).toMatchObject({
    organizationId: "organization",
    capabilities: ["caller_wakes"],
  });
});

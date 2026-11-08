import type { HarnessEvent } from "@startup-os/contracts/harness";

import { createAgentRunner } from "./agent-runner.ts";
import { expect, test } from "bun:test";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unsafe-dictionary-type, deslop/require-safety-comment-for-type-assertion -- The fake server and harness record untyped JSON bodies and IPC commands, as the real boundaries do. */

const run = {
  id: "00000000-0000-4000-8000-000000000001",
  agentId: "agent-1",
  conversationId: "conversation-1",
  threadId: "thread-1",
  prompt: "Alice sent you a direct message.",
  resumeSessionId: null as string | null,
};

function fixture(options: { claims?: (typeof run)[]; resumeFails?: boolean } = {}) {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  const commands: Record<string, unknown>[] = [];
  let claims = options.claims ?? [run];
  let deliveries: unknown[] = [];
  let cancelled: string[] = [];
  const timers: (() => void)[] = [];
  const runner = createAgentRunner({
    backend: "https://api.example.com",
    installationId: "11111111-1111-4111-8111-111111111111",
    device: { name: "Laptop", platform: "win32" },
    every: (callback) => {
      timers.push(callback);
      return () => {};
    },
    fetchAPI: async (url, init) => {
      const path = new URL(url).pathname;
      if (path === "/api/v1/session")
        return Response.json({
          success: true,
          data: { user: { id: "alice" }, session: { activeOrganizationId: "org-1" } },
        });
      if (path === "/api/v1/agents/list")
        return Response.json({
          success: true,
          data: { agents: [{ id: "agent-1", harness: "claude" }] },
        });
      const body = JSON.parse(await new Response(init.body).text());
      posts.push({ path: path.replace("/api/v1/agent-runs", ""), body });
      if (path.endsWith("/device/claim")) {
        const data = claims;
        claims = [];
        return Response.json({ success: true, data });
      }
      if (path.endsWith("/device/deliveries")) {
        const data = deliveries;
        deliveries = [];
        return Response.json({ success: true, data });
      }
      if (path.endsWith("/device/heartbeat"))
        return Response.json({ success: true, data: { running: [], cancelled } });
      if (path.endsWith("/device/requests/open"))
        return Response.json({ success: true, data: { id: "request-1" } });
      return Response.json({ success: true, data: null });
    },
    harness: {
      run: async (method, value) => {
        if (method === "synchronize") return { connected: true, organizationId: "org-1" };
        const command = value as Record<string, unknown>;
        commands.push(command);
        if (command.type === "resume" && options.resumeFails) throw new Error("missing");
        if (command.type === "start" || command.type === "resume") return { id: "session-1" };
        return undefined;
      },
    },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  const emit = (event: Record<string, unknown>) =>
    runner.onHarnessEvent({
      sessionId: "session-1",
      organizationId: "org-1",
      timestamp: 0,
      ...event,
    } as HarnessEvent);
  return {
    runner,
    posts,
    commands,
    settle,
    emit,
    paths: () => posts.map((post) => post.path),
    tick: () => timers.forEach((timer) => timer()),
    setDeliveries: (value: unknown[]) => {
      deliveries = value;
    },
    setCancelled: (value: string[]) => {
      cancelled = value;
    },
  };
}

test("a claimed run starts a session with the server's prompt and reports its transcript", async () => {
  const f = fixture();
  f.runner.start();
  await f.settle();
  expect(f.paths().slice(0, 4)).toEqual([
    "/device/register",
    "/device/claim",
    "/device/session",
    "/device/events",
  ]);
  expect(f.posts[0]!.body).toMatchObject({ name: "Laptop", platform: "win32" });
  expect(f.commands.map((command) => command.type)).toEqual(["start", "prompt"]);
  expect(f.commands[1]).toMatchObject({ sessionId: "session-1", text: run.prompt });

  f.emit({ type: "text", text: "Looking ", delta: true });
  f.emit({ type: "text", text: "now.", delta: true });
  f.emit({ type: "activity", name: "tool_progress", data: { tool_name: "Bash" } });
  f.emit({ type: "turn-completed", status: "completed" });
  await f.settle();
  const events = f.posts.filter((post) => post.path === "/device/events").at(-1)!.body.events;
  expect(events).toEqual([
    { kind: "text", text: "Looking now." },
    { kind: "activity", text: "Using Bash" },
  ]);
  expect(f.posts.find((post) => post.path === "/device/finish")!.body).toMatchObject({
    runId: run.id,
    status: "completed",
  });
  expect(f.commands.at(-1)).toMatchObject({ type: "disconnect", sessionId: "session-1" });
  expect(f.runner.activeRuns()).toEqual([]);
});

test("a thread's next turn resumes its session and falls back to a new one", async () => {
  const f = fixture({ claims: [{ ...run, resumeSessionId: "old-session" }], resumeFails: true });
  f.runner.start();
  await f.settle();
  expect(f.commands.map((command) => command.type)).toEqual(["resume", "start", "prompt"]);
});

test("a harness request is shown in the app and the owner's answer goes back to the harness", async () => {
  const f = fixture();
  f.runner.start();
  await f.settle();
  f.emit({
    type: "request",
    requestId: "native-1",
    kind: "permission",
    data: { toolName: "Bash", input: { command: "rm -rf build" } },
  });
  await f.settle();
  expect(f.posts.find((post) => post.path === "/device/requests/open")!.body).toMatchObject({
    nativeRequestId: "native-1",
    payload: { type: "approval", title: "Allow Bash?", detail: "rm -rf build" },
  });

  f.setDeliveries([
    {
      requestId: "request-1",
      runId: run.id,
      nativeRequestId: "native-1",
      response: { type: "approval", optionId: "allow" },
    },
  ]);
  f.runner.onRealtime({
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: "org-1",
    domain: "agent-runs",
  });
  await f.settle();
  expect(f.commands.at(-1)).toMatchObject({
    type: "respond",
    sessionId: "session-1",
    requestId: "native-1",
    response: "allow",
  });
  expect(f.posts.find((post) => post.path === "/device/requests/close")!.body).toMatchObject({
    requestId: "request-1",
    status: "delivered",
  });
});

test("the owner's cancel interrupts the turn at the next heartbeat", async () => {
  const f = fixture();
  f.runner.start();
  await f.settle();
  f.setCancelled([run.id]);
  f.tick();
  await f.settle();
  expect(f.commands.map((command) => command.type)).toContain("interrupt");
  expect(f.posts.find((post) => post.path === "/device/finish")!.body).toMatchObject({
    status: "cancelled",
  });
});

test("only agent-run hints and reconnects wake the runner", async () => {
  const f = fixture({ claims: [] });
  f.runner.onRealtime({
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: "org-1",
    domain: "messaging",
  });
  await f.settle();
  expect(f.paths()).toEqual([]);
  f.runner.onRealtime({ version: 1, type: "ready" });
  await f.settle();
  expect(f.paths()).toEqual(["/device/register", "/device/claim"]);
});

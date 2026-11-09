import type {
  AdapterCapabilities,
  HarnessAgent,
  HarnessEvent,
  TurnResult,
} from "@startup-os/contracts/harness";
import type { TurnContext, WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";

import type { AdapterContext, NativeAdapter } from "./adapters/types.ts";
import { createHarnessHost, type ConnectNative } from "./host.ts";
import { createMemoryStorage } from "./test-support.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations. */

const agentId = "ad4f709e-b80e-40f5-80ee-588e1db066e5";
const turnId = "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71";
const context: TurnContext = {
  turnId,
  attempt: 1,
  sessionKey: "dm:9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718",
  origin: { conversationId: "9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718", threadId: null },
  kind: "interactive",
};
const capabilities: AdapterCapabilities = {
  steer: false,
  steerEvidence: false,
  compact: false,
  usage: false,
  noAskProfile: true,
  interruptReceipt: false,
};
let root: string;

beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  root = await mkdtemp(join(tmpdir(), "opencode", "harness-host-test-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function agent(overrides: Partial<HarnessAgent> = {}): HarnessAgent {
  return {
    id: agentId,
    name: "Agent",
    instructions: "Work locally",
    harness: "codex",
    enabled: true,
    useStartupDefaults: true,
    ...overrides,
  };
}

/** The latest native session the fake opened. */
interface FakeNative {
  context?: AdapterContext;
  finish?: (result: TurnResult) => void;
  resumes: (string | undefined)[];
}

function fakeNative() {
  const state: FakeNative = { resumes: [] };
  const connect: ConnectNative = async (_harness, adapterContext, resumeId) => {
    state.resumes.push(resumeId);
    if (resumeId === "lost") throw new Error("missing native session");
    state.context = adapterContext;
    let finish: ((result: TurnResult) => void) | undefined;
    const adapter: NativeAdapter = {
      capabilities,
      nativeSessionId: resumeId ?? "native-new",
      turn: () =>
        new Promise((resolve) => {
          finish = resolve;
          state.finish = resolve;
        }),
      interrupt: async () => ({}),
      respond: async () => {},
      disconnect: async () => finish?.({ status: "failed", error: "closed" }),
    };
    return adapter;
  };
  return { state, connect };
}

async function host(
  options: { keepAliveMs?: number; interruptGraceMs?: number; calls?: WorkspaceApiRequest[] } = {},
) {
  const native = fakeNative();
  const events: HarnessEvent[] = [];
  const created = await createHarnessHost({
    accountDirectory: root,
    storage: createMemoryStorage(),
    connect: native.connect,
    keepAliveMs: options.keepAliveMs,
    interruptGraceMs: options.interruptGraceMs,
    workspaceProxy: async (call) => {
      options.calls?.push(call);
      return { success: true, data: { items: [], nextCursor: null } };
    },
  });
  created.subscribe((event) => events.push(event));
  await created.configure({ organizationId: "org-a", agents: [agent()] });
  return { host: created, native, events };
}

const open = {
  type: "open" as const,
  organizationId: "org-a",
  sessionId: "session-a",
  agentId,
  folder: "main" as const,
  epoch: 0,
  prefix: "# Managed policy\n",
};
const turn = {
  type: "turn" as const,
  organizationId: "org-a",
  sessionId: "session-a",
  turnId,
  generation: 1,
  mode: "interactive" as const,
  input: { inputIds: ["item-1"], text: "<turn></turn>" },
  context,
};

test("host uses caller-owned storage without creating a database", async () => {
  const { host: created } = await host();
  try {
    expect(await readdir(root)).not.toContain(".startup-os");
  } finally {
    await created.dispose();
  }
});

test("MCP calls are accepted only while a turn is bound to the session", async () => {
  const calls: WorkspaceApiRequest[] = [];
  const f = await host({ calls });
  const client = new Client({ name: "host-test", version: "1" });
  try {
    await f.host.execute(open);
    const lease = f.native.state.context!.lease!;
    await client.connect(
      new StreamableHTTPClientTransport(new URL(lease.url), {
        requestInit: { headers: { Authorization: `Bearer ${lease.token}` } },
      }),
    );
    const call = () => client.callTool({ name: "list_projects", arguments: {} });
    expect((await call()).isError).toBe(true);
    await f.host.execute(turn);
    expect((await call()).isError).toBeFalsy();
    expect(calls.map((entry) => entry.turn)).toEqual([context]);
    f.native.state.finish!({ status: "completed", consumedInputIds: ["item-1"] });
    await Bun.sleep(0);
    expect((await call()).isError).toBe(true);
    expect(calls).toHaveLength(1);
  } finally {
    await client.close();
    await f.host.dispose();
  }
});

test("turn events carry the turn; session-scoped native output and the result do not mix", async () => {
  const f = await host();
  try {
    await f.host.execute(open);
    await f.host.execute(turn);
    f.native.state.context!.emit({ type: "text", text: "ours" });
    f.native.state.context!.emit({ type: "text", text: "native" }, "session");
    f.native.state.finish!({ status: "completed", consumedInputIds: ["item-1"] });
    await Bun.sleep(0);
    f.native.state.context!.emit({ type: "text", text: "after" });
    expect(f.events.map((event) => [event.type, event.turnId])).toEqual([
      ["turn.started", turnId],
      ["text", turnId],
      ["text", null],
      ["turn.completed", turnId],
      ["text", null],
    ]);
    expect(f.events.find((event) => event.type === "turn.completed")).toMatchObject({
      result: { status: "completed", consumedInputIds: ["item-1"] },
      generation: 1,
    });
  } finally {
    await f.host.dispose();
  }
});

test("a second turn while one is live is rejected", async () => {
  const f = await host();
  try {
    await f.host.execute(open);
    await f.host.execute(turn);
    await expect(f.host.execute(turn)).rejects.toMatchObject({ code: "turn-active" });
  } finally {
    await f.host.dispose();
  }
});

test("open rewrites the instructions file with the managed prefix and reports failed resumes", async () => {
  const f = await host();
  try {
    const ref = await f.host.execute({ ...open, nativeSessionId: "lost" });
    expect(ref).toMatchObject({ nativeSessionId: "native-new", resumed: false });
    const instructions = await readFile(join(root, "orgs", "org-a", agentId, "AGENTS.md"), "utf8");
    expect(instructions.startsWith("# Managed policy\n")).toBe(true);
    expect(instructions).toContain("Work locally");
    await expect(
      f.host.execute({
        ...open,
        sessionId: "session-b",
        nativeSessionId: "lost",
        requireResume: true,
      }),
    ).rejects.toMatchObject({ code: "resume-failed" });
  } finally {
    await f.host.dispose();
  }
});

test("helper sessions open in their own folder", async () => {
  const f = await host();
  try {
    await f.host.execute({ ...open, folder: { helperId: "helper-1" } });
    expect(f.native.state.context!.directory).toBe(
      join(await realpath(root), "orgs", "org-a", "_helpers", agentId, "helper-1"),
    );
    await expect(
      f.host.execute({ ...open, sessionId: "session-c", folder: { helperId: "../x" } }),
    ).rejects.toMatchObject({ code: "invalid-id" });
  } finally {
    await f.host.dispose();
  }
});

test("the reaper closes idle sessions but keeps sessions with a live turn", async () => {
  const f = await host({ keepAliveMs: 30 });
  try {
    await f.host.execute(open);
    await f.host.execute({ ...open, sessionId: "session-b" });
    await f.host.execute({ ...turn, sessionId: "session-b" });
    await Bun.sleep(120);
    const closed = f.events.filter((event) => event.type === "session.closed");
    expect(closed.map((event) => [event.sessionId, event.reason])).toEqual([["session-a", "idle"]]);
  } finally {
    await f.host.dispose();
  }
});

function closedEvents(events: HarnessEvent[]) {
  return events.flatMap((event) =>
    event.type === "session.closed" ? [[event.sessionId, event.reason]] : [],
  );
}

test("interrupt without the live turn fails with no-live-turn", async () => {
  const f = await host();
  try {
    const interrupt = {
      type: "interrupt" as const,
      organizationId: "org-a",
      sessionId: "session-a",
      turnId,
    };
    await expect(f.host.execute(interrupt)).rejects.toMatchObject({ code: "no-live-turn" });
    await f.host.execute(open);
    await expect(f.host.execute(interrupt)).rejects.toMatchObject({ code: "no-live-turn" });
  } finally {
    await f.host.dispose();
  }
});

test("open with another epoch or native session replaces the open session", async () => {
  const f = await host();
  try {
    await f.host.execute({ ...open, nativeSessionId: "native-1" });
    expect(await f.host.execute({ ...open, nativeSessionId: "native-1" })).toMatchObject({
      nativeSessionId: "native-1",
    });
    expect(f.native.state.resumes).toEqual(["native-1"]);
    const fresh = await f.host.execute({ ...open, epoch: 1 });
    expect(fresh).toMatchObject({ nativeSessionId: "native-new", resumed: false });
    expect(f.native.state.resumes).toEqual(["native-1", undefined]);
    await f.host.execute({ ...open, epoch: 1, nativeSessionId: "native-2" });
    expect(f.native.state.resumes).toEqual(["native-1", undefined, "native-2"]);
    expect(closedEvents(f.events)).toEqual([
      ["session-a", "closed"],
      ["session-a", "closed"],
    ]);
  } finally {
    await f.host.dispose();
  }
});

test("configure closes changed idle sessions at once and live ones after their turn", async () => {
  const f = await host();
  try {
    await f.host.execute(open);
    await f.host.execute({ ...open, sessionId: "session-b" });
    await f.host.execute({ ...turn, sessionId: "session-b" });
    await f.host.configure({
      organizationId: "org-a",
      agents: [agent({ instructions: "Changed" })],
    });
    expect(closedEvents(f.events)).toEqual([["session-a", "configuration"]]);
    expect(f.events.some((event) => event.type === "turn.completed")).toBe(false);
    f.native.state.finish!({ status: "completed", consumedInputIds: ["item-1"] });
    await Bun.sleep(10);
    expect(closedEvents(f.events)).toEqual([
      ["session-a", "configuration"],
      ["session-b", "configuration"],
    ]);
    const completed = f.events.findIndex((event) => event.type === "turn.completed");
    expect(f.events[completed]).toMatchObject({ result: { status: "completed" } });
    expect(completed).toBeLessThan(f.events.length - 1);
  } finally {
    await f.host.dispose();
  }
});

test("closeOrganization ends and closes that organization's sessions, whatever is active", async () => {
  const f = await host();
  try {
    await f.host.configure({ organizationId: "org-b", agents: [agent()] });
    await f.host.execute(open);
    await f.host.execute(turn);
    await f.host.execute({ ...open, organizationId: "org-b", sessionId: "session-b" });
    await f.host.closeOrganization("org-a");
    const ends = f.events.flatMap((event) =>
      event.type === "turn.completed" || event.type === "session.closed"
        ? [[event.type, event.sessionId]]
        : [],
    );
    // The turn ends before its session closes; the other organization keeps its session.
    expect(ends).toEqual([
      ["turn.completed", "session-a"],
      ["session.closed", "session-a"],
    ]);
    await expect(f.host.execute(turn)).rejects.toMatchObject({ code: "not-connected" });
    expect(
      await f.host.execute({ ...open, organizationId: "org-b", sessionId: "session-b" }),
    ).toMatchObject({ id: "session-b" });
  } finally {
    await f.host.dispose();
  }
});

test("an interrupt the harness never confirms still ends the turn as interrupted", async () => {
  const f = await host({ interruptGraceMs: 20 });
  try {
    await f.host.execute(open);
    await f.host.execute(turn);
    expect(
      await f.host.execute({
        type: "interrupt",
        organizationId: "org-a",
        sessionId: "session-a",
        turnId,
      }),
    ).toEqual({});
    await Bun.sleep(80);
    const terminal = f.events.filter((event) => event.type === "turn.completed");
    expect(terminal).toHaveLength(1);
    expect(terminal[0]).toMatchObject({ turnId, result: { status: "interrupted" } });
    // The native state is unknown after an unconfirmed interrupt, so the session closes.
    expect(closedEvents(f.events)).toEqual([["session-a", "closed"]]);
  } finally {
    await f.host.dispose();
  }
});

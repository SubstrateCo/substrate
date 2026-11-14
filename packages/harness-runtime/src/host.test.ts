import { sessionKeys } from "@substrate/contracts/agent-work";
import type {
  AdapterCapabilities,
  HarnessAgent,
  HarnessEvent,
  TurnResult,
} from "@substrate/contracts/harness";
import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";

import type { AdapterContext, NativeAdapter } from "./adapters/types.ts";
import { createHarnessHost, type ConnectNative, type HostClock } from "./host.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const agentId = "ad4f709e-b80e-40f5-80ee-588e1db066e5";
const turnId = "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71";
const context: TurnContext = {
  turnId,
  attempt: 1,
  sessionKey: sessionKeys.dm("9b2c1d4e-5f60-4a71-8b92-c3d4e5f60718"),
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

function fakeNative(steer = false) {
  const state: FakeNative = { resumes: [] };
  const connect: ConnectNative = async (_harness, adapterContext, _prefix, resumeId) => {
    state.resumes.push(resumeId);
    if (resumeId === "lost") throw new Error("missing native session");
    state.context = adapterContext;
    let finish: ((result: TurnResult) => void) | undefined;
    const adapter: NativeAdapter = {
      capabilities: { ...capabilities, steer },
      steer: async () => {},
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
  options: {
    keepAliveMs?: number;
    interruptGraceMs?: number;
    calls?: WorkspaceApiRequest[];
    steer?: boolean;
    connect?: ConnectNative;
    clock?: HostClock;
  } = {},
) {
  const native = fakeNative(options.steer);
  const events: HarnessEvent[] = [];
  const created = await createHarnessHost({
    accountDirectory: root,
    connect: options.connect ?? native.connect,
    keepAliveMs: options.keepAliveMs,
    interruptGraceMs: options.interruptGraceMs,
    clock: options.clock,
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

test("steered calls join the bound MCP context and do not leak into the next turn", async () => {
  const calls: WorkspaceApiRequest[] = [];
  const f = await host({ calls, steer: true });
  const client = new Client({ name: "host-test", version: "1" });
  try {
    await f.host.execute(open);
    const lease = f.native.state.context!.lease!;
    await client.connect(
      new StreamableHTTPClientTransport(new URL(lease.url), {
        requestInit: { headers: { Authorization: `Bearer ${lease.token}` } },
      }),
    );
    await f.host.execute(turn);
    const invocationId = crypto.randomUUID();
    await f.host.execute({
      type: "steer",
      organizationId: "org-a",
      sessionId: "session-a",
      turnId,
      inputId: "call",
      text: "Caller asks",
      invocationIds: [invocationId],
    });
    await client.callTool({ name: "list_projects", arguments: {} });
    expect(calls.at(-1)?.turn.invocationIds).toEqual([invocationId]);
    f.native.state.finish!({ status: "completed" });
    await Bun.sleep(0);
    const nextTurnId = crypto.randomUUID();
    await f.host.execute({
      ...turn,
      turnId: nextTurnId,
      context: { ...context, turnId: nextTurnId },
    });
    await client.callTool({ name: "list_projects", arguments: {} });
    expect(calls.at(-1)?.turn.invocationIds).toBeUndefined();
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
    await rejects(f.host.execute(turn), { code: "turn-active" });
  } finally {
    await f.host.dispose();
  }
});

test("an open of a session that closes after its live turn waits with session-closing", async () => {
  const f = await host();
  try {
    await f.host.execute(open);
    await f.host.execute(turn);
    await f.host.configure({
      organizationId: "org-a",
      agents: [agent({ instructions: "Work elsewhere" })],
    });
    await rejects(f.host.execute(open), { code: "session-closing" });
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
    await rejects(
      f.host.execute({
        ...open,
        sessionId: "session-b",
        nativeSessionId: "lost",
        requireResume: true,
      }),
      { code: "resume-failed" },
    );
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
    await rejects(
      f.host.execute({ ...open, sessionId: "session-c", folder: { helperId: "../x" } }),
      { code: "invalid-id" },
    );
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
    await rejects(f.host.execute(interrupt), { code: "no-live-turn" });
    await f.host.execute(open);
    await rejects(f.host.execute(interrupt), { code: "no-live-turn" });
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
    await rejects(f.host.execute(turn), { code: "not-connected" });
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

test("reopen waits for disconnect and repeated closes share terminal cleanup", async () => {
  const native = fakeNative();
  const disconnecting = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let disconnects = 0;
  const f = await host({
    connect: async (...args) => {
      const adapter = await native.connect(...args);
      return {
        ...adapter,
        disconnect: async () => {
          disconnects++;
          disconnecting.resolve();
          await release.promise;
          await adapter.disconnect();
        },
      };
    },
  });
  try {
    await f.host.execute(open);
    await f.host.execute(turn);
    const closing = f.host.execute({ ...open, type: "close" });
    await disconnecting.promise;
    const again = f.host.execute({ ...open, type: "close" });
    const reopened = f.host.execute(open);
    await Bun.sleep(0);
    expect(native.state.resumes).toHaveLength(1);
    expect(f.events.filter((event) => event.type === "session.closed")).toHaveLength(0);
    release.resolve();
    await Promise.all([closing, again, reopened]);
    expect(disconnects).toBe(1);
    expect(native.state.resumes).toHaveLength(2);
    expect(f.events.map((event) => event.type)).toEqual([
      "turn.started",
      "turn.completed",
      "session.closed",
    ]);
  } finally {
    release.resolve();
    await f.host.dispose();
  }
});

test("close cancels a pending open and revokes its MCP lease", async () => {
  const native = fakeNative();
  const connecting = Promise.withResolvers<AdapterContext>();
  const release = Promise.withResolvers<void>();
  let disconnected = false;
  const f = await host({
    connect: async (...args) => {
      connecting.resolve(args[1]);
      await release.promise;
      const adapter = await native.connect(...args);
      return {
        ...adapter,
        disconnect: async () => {
          disconnected = true;
        },
      };
    },
  });
  try {
    const opened = f.host.execute(open);
    const outcome = opened.catch((error: Error) => error);
    const adapterContext = await connecting.promise;
    const closing = f.host.execute({ ...open, type: "close" });
    const lease = adapterContext.lease!;
    const response = await fetch(lease.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${lease.token}` },
      body: "{}",
    });
    release.resolve();
    expect(response.status).toBe(401);
    expect(await outcome).toMatchObject({ code: "not-connected" });
    await closing;
    expect(disconnected).toBe(true);
    expect(closedEvents(f.events)).toEqual([["session-a", "closed"]]);
  } finally {
    release.resolve();
    await f.host.dispose();
  }
});

test("concurrent disposals wait for pending opens and their native cleanup", async () => {
  const native = fakeNative();
  const connecting = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let disconnected = false;
  const f = await host({
    connect: async (...args) => {
      connecting.resolve();
      await release.promise;
      const adapter = await native.connect(...args);
      return {
        ...adapter,
        disconnect: async () => {
          disconnected = true;
        },
      };
    },
  });
  const opened = f.host.execute(open);
  const outcome = opened.catch((error: Error) => error);
  await connecting.promise;
  let disposed = 0;
  const first = f.host.dispose().then(() => {
    disposed++;
  });
  const second = f.host.dispose().then(() => {
    disposed++;
  });
  await Bun.sleep(0);
  const beforeRelease = disposed;
  release.resolve();
  await Promise.all([first, second]);
  expect(await outcome).toMatchObject({ code: "disposed" });
  expect(beforeRelease).toBe(0);
  expect(disconnected).toBe(true);
  expect(disposed).toBe(2);
  expect(closedEvents(f.events)).toEqual([["session-a", "closed"]]);
});

test("a failed disconnect still ends its turn, revokes MCP and allows a fresh open", async () => {
  const native = fakeNative();
  let fail = true;
  const f = await host({
    connect: async (...args) => {
      const adapter = await native.connect(...args);
      return {
        ...adapter,
        disconnect: async () => {
          if (fail) throw new Error("disconnect failed");
          await adapter.disconnect();
        },
      };
    },
  });
  try {
    await f.host.execute(open);
    await f.host.execute(turn);
    const lease = native.state.context!.lease!;
    await rejects(f.host.execute({ ...open, type: "close" }), /disconnect failed/);
    expect(f.events.map((event) => event.type)).toEqual([
      "turn.started",
      "turn.completed",
      "session.closed",
    ]);
    expect(f.events[1]).toMatchObject({ turnId, result: { status: "failed" } });
    const response = await fetch(lease.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${lease.token}` },
      body: "{}",
    });
    expect(response.status).toBe(401);
    fail = false;
    await f.host.execute(open);
    await f.host.execute(turn);
    native.state.finish!({ status: "completed" });
    await Bun.sleep(0);
    expect(f.events.filter((event) => event.type === "turn.completed")).toHaveLength(2);
  } finally {
    fail = false;
    await f.host.dispose();
  }
});

test("closeOrganization cancels its pending opens without closing another organization", async () => {
  const native = fakeNative();
  const connecting = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const f = await host({
    connect: async (...args) => {
      if (args[1].directory.includes("org-a")) {
        connecting.resolve();
        await release.promise;
      }
      return native.connect(...args);
    },
  });
  try {
    await f.host.configure({ organizationId: "org-b", agents: [agent()] });
    await f.host.execute({ ...open, organizationId: "org-b", sessionId: "session-b" });
    const outcome = f.host.execute(open).catch((error: Error) => error);
    await connecting.promise;
    const closing = f.host.closeOrganization("org-a");
    release.resolve();
    expect(await outcome).toMatchObject({ code: "not-connected" });
    await closing;
    expect(closedEvents(f.events)).toEqual([["session-a", "closed"]]);
    await f.host.execute({ ...turn, organizationId: "org-b", sessionId: "session-b" });
    expect(f.events.at(-1)).toMatchObject({
      type: "turn.started",
      organizationId: "org-b",
      sessionId: "session-b",
      turnId,
      generation: 1,
    });
  } finally {
    release.resolve();
    await f.host.dispose();
  }
});

for (const action of ["close", "organization", "dispose"] as const) {
  test(`${action} reports a disconnect failure after cancelling a pending open`, async () => {
    const native = fakeNative();
    const connecting = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const f = await host({
      connect: async (...args) => {
        connecting.resolve();
        await release.promise;
        const adapter = await native.connect(...args);
        return {
          ...adapter,
          disconnect: async () => {
            throw new Error("pending disconnect failed");
          },
        };
      },
    });
    try {
      const opened = f.host.execute(open).catch((error: Error) => error);
      await connecting.promise;
      let closing: Promise<void>;
      if (action === "close") closing = f.host.execute({ ...open, type: "close" });
      else if (action === "organization") closing = f.host.closeOrganization("org-a");
      else closing = f.host.dispose();
      const closed = closing.catch((error: Error) => error);
      release.resolve();
      expect(await closed).toMatchObject({ message: "pending disconnect failed" });
      expect(await opened).toMatchObject({ message: "pending disconnect failed" });
      expect(closedEvents(f.events)).toEqual([["session-a", "closed"]]);
    } finally {
      release.resolve();
      await f.host.dispose().catch(() => {});
    }
  });
}

function manualClock() {
  let now = 0;
  const timers = new Map<() => void, number>();
  const clock: HostClock = {
    now: () => now,
    later(callback, milliseconds) {
      timers.set(callback, now + milliseconds);
      return () => {
        timers.delete(callback);
      };
    },
  };
  return {
    clock,
    advance(milliseconds: number) {
      now += milliseconds;
      for (const [callback, due] of timers) {
        if (due > now) continue;
        timers.delete(callback);
        callback();
      }
    },
  };
}

for (const action of ["close", "organization", "dispose"] as const) {
  test(`${action} bounds a stuck pending open and cleans up its late adapter`, async () => {
    const native = fakeNative();
    const clock = manualClock();
    const connecting = Promise.withResolvers<AdapterContext>();
    const release = Promise.withResolvers<void>();
    let disconnected = false;
    const f = await host({
      clock: clock.clock,
      connect: async (...args) => {
        connecting.resolve(args[1]);
        await release.promise;
        const adapter = await native.connect(...args);
        return {
          ...adapter,
          disconnect: async () => {
            disconnected = true;
          },
        };
      },
    });
    try {
      const opened = f.host.execute(open).catch((error: Error) => error);
      const adapterContext = await connecting.promise;
      let closing: Promise<void>;
      if (action === "close") closing = f.host.execute({ ...open, type: "close" });
      else if (action === "organization") closing = f.host.closeOrganization("org-a");
      else closing = f.host.dispose();
      let finished = false;
      const outcome = closing
        .catch((error: Error) => error)
        .then((result) => {
          finished = true;
          return result;
        });
      clock.advance(1_999);
      await Bun.sleep(0);
      expect(finished).toBe(false);
      clock.advance(1);
      await Bun.sleep(0);
      expect(finished).toBe(true);
      expect(await outcome).toMatchObject({ code: "request-timeout" });
      expect(disconnected).toBe(false);
      if (action !== "dispose") {
        const lease = adapterContext.lease!;
        const response = await fetch(lease.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${lease.token}` },
          body: "{}",
        });
        expect(response.status).toBe(401);
      }
      release.resolve();
      expect(await opened).toMatchObject({
        code: action === "dispose" ? "disposed" : "not-connected",
      });
      expect(disconnected).toBe(true);
      await rejects(f.host.execute(turn), {
        code: action === "dispose" ? "disposed" : "not-connected",
      });
    } finally {
      release.resolve();
      const cleanup = f.host.dispose().catch(() => {});
      clock.advance(2_000);
      await cleanup;
    }
  });
}

for (const action of ["close", "organization", "dispose"] as const) {
  for (const failure of [false, true]) {
    test(`${action} handles overlapping pending-open cleanup with ${failure ? "disconnect failure" : "timeout"}`, async () => {
      const native = fakeNative();
      const clock = manualClock();
      const connecting = Promise.withResolvers<void>();
      const releaseConnect = Promise.withResolvers<void>();
      const disconnecting = Promise.withResolvers<void>();
      const releaseDisconnect = Promise.withResolvers<void>();
      const f = await host({
        clock: clock.clock,
        connect: async (...args) => {
          connecting.resolve();
          await releaseConnect.promise;
          const adapter = await native.connect(...args);
          return {
            ...adapter,
            disconnect: async () => {
              disconnecting.resolve();
              await releaseDisconnect.promise;
            },
          };
        },
      });
      try {
        const opened = f.host.execute(open).catch((error: Error) => error);
        await connecting.promise;
        const firstClose = f.host
          .execute({ ...open, type: "close" })
          .catch((error: Error) => error);
        releaseConnect.resolve();
        await disconnecting.promise;
        let closing: Promise<void>;
        if (action === "close") closing = f.host.execute({ ...open, type: "close" });
        else if (action === "organization") closing = f.host.closeOrganization("org-a");
        else closing = f.host.dispose();
        let finished = false;
        const outcome = closing
          .catch((error: Error) => error)
          .then((result) => {
            finished = true;
            return result;
          });
        if (failure) releaseDisconnect.reject(new Error("overlap disconnect failed"));
        else clock.advance(2_000);
        await Bun.sleep(0);
        expect(finished).toBe(true);
        const expected = failure
          ? { message: "overlap disconnect failed" }
          : { code: "request-timeout" };
        expect(await outcome).toMatchObject(expected);
        expect(await firstClose).toMatchObject(expected);
        releaseDisconnect.resolve();
        const openError = { code: action === "dispose" ? "disposed" : "not-connected" };
        expect(await opened).toMatchObject(failure ? expected : openError);
        await rejects(f.host.execute(turn), {
          code: action === "dispose" ? "disposed" : "not-connected",
        });
      } finally {
        releaseConnect.resolve();
        releaseDisconnect.resolve();
        const cleanup = f.host.dispose().catch(() => {});
        clock.advance(2_000);
        await cleanup;
      }
    });
  }
}

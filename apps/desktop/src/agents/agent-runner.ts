import {
  agentRunRequestResponse,
  finishRunInput,
  nativeHarnessResponse,
  normalizeHarnessRequest,
  type ClaimedAgentRun,
} from "@startup-os/contracts/agent-runs";
import {
  harnessKinds,
  type HarnessCommand,
  type HarnessEvent,
  type HarnessKind,
} from "@startup-os/contracts/harness";
import type { RealtimeUpdate } from "@startup-os/contracts/realtime";

import { activityLine } from "./activity.ts";
/* oxlint-disable deslop/no-unknown-parameters, deslop/no-unknown-returns -- The harness controller returns unparsed worker results; this runner parses each one at this boundary. */
import { z } from "zod";

/** The harness controller's IPC surface, used by main without the renderer. */
export interface RunnerHarness {
  run(method: "synchronize" | "execute", value?: unknown): Promise<unknown>;
}

interface Options {
  backend: string;
  installationId: string;
  device: { name: string; platform: string };
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  harness: RunnerHarness;
  /** Injected for tests. */
  every?: (callback: () => void, milliseconds: number) => () => void;
  log?: (message: string) => void;
}

interface ActiveRun {
  run: ClaimedAgentRun;
  organizationId: string;
  sessionId: string;
  harness: HarnessKind;
  text: string;
  lastActivity: string | null;
  queue: { kind: "text" | "activity" | "error"; text: string }[];
  /** Native request ID to the server request and the native data needed to answer it. */
  requests: Map<string, { kind: "permission" | "input"; data: unknown }>;
  finished: boolean;
}

const sessionSchema = z.object({
  success: z.literal(true),
  data: z.object({
    user: z.object({ id: z.string() }),
    session: z.object({ activeOrganizationId: z.string().nullish() }),
  }),
});
const sessionRefSchema = z.object({ id: z.string().min(1) });
const catalogSchema = z.object({
  success: z.literal(true),
  data: z.object({
    agents: z.array(z.object({ id: z.string(), harness: z.enum(harnessKinds) })),
  }),
});
const result = <T extends z.ZodType>(data: T) =>
  z.union([
    z.object({ success: z.literal(true), data }),
    z.object({ success: z.literal(false), error: z.object({ code: z.string() }) }),
  ]);
const claimSchema = result(
  z.array(
    z.object({
      id: z.string(),
      agentId: z.string(),
      conversationId: z.string(),
      threadId: z.string(),
      prompt: z.string(),
      resumeSessionId: z.string().nullable(),
    }),
  ),
);
const heartbeatSchema = result(
  z.object({ running: z.array(z.string()), cancelled: z.array(z.string()) }),
);
const deliveriesSchema = result(
  z.array(
    z.object({
      requestId: z.string(),
      runId: z.string(),
      nativeRequestId: z.string(),
      response: agentRunRequestResponse,
    }),
  ),
);
const openedSchema = result(z.object({ id: z.string() }));

const defaultEvery = (callback: () => void, milliseconds: number) => {
  const timer = setInterval(callback, milliseconds);
  return () => clearInterval(timer);
};

/**
 * Runs the owner's agents whose home is this device. The server is the queue: a realtime hint
 * or a timer wakes the runner, which claims runs, drives the harness, and reports back. Replies
 * reach the conversation only through the agent's own send_message calls.
 */
export function createAgentRunner(options: Options) {
  const every = options.every ?? defaultEvery;
  const log = options.log ?? (() => {});
  const active = new Map<string, ActiveRun>();
  let registeredFor: string | undefined;
  let cycling: Promise<void> | undefined;
  let again = false;
  let stopped = false;
  const timers: (() => void)[] = [];

  async function call(path: string, body: unknown) {
    const response = await options.fetchAPI(
      new URL(`/api/v1/agent-runs${path}`, options.backend).href,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
      },
    );
    return response.json();
  }

  const identity = (organizationId: string) => ({
    organizationId,
    installationId: options.installationId,
  });

  async function session() {
    const response = await options.fetchAPI(new URL("/api/v1/session", options.backend).href, {
      method: "GET",
      redirect: "error",
    });
    if (!response.ok) return null;
    const parsed = sessionSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.data : null;
  }

  async function harnessKindsByAgent() {
    const response = await options.fetchAPI(new URL("/api/v1/agents/list", options.backend).href, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
      redirect: "error",
    });
    const parsed = catalogSchema.parse(await response.json());
    return new Map(parsed.data.agents.map((agent) => [agent.id, agent.harness]));
  }

  async function execute(command: HarnessCommand) {
    return options.harness.run("execute", command);
  }

  function enqueue(state: ActiveRun, kind: "text" | "activity" | "error", text: string) {
    if (!text.trim()) return;
    state.queue.push({ kind, text: text.slice(0, 20_000) });
  }

  function flushText(state: ActiveRun) {
    if (state.text) enqueue(state, "text", state.text);
    state.text = "";
  }

  async function sendEvents(state: ActiveRun) {
    flushText(state);
    if (!state.queue.length) return;
    const events = state.queue.splice(0, 100);
    try {
      await call("/device/events", {
        ...identity(state.organizationId),
        runId: state.run.id,
        events,
      });
    } catch {
      log("Could not send run events.");
    }
  }

  async function finish(
    state: ActiveRun,
    status: "completed" | "failed" | "cancelled",
    error?: string,
  ) {
    if (state.finished) return;
    state.finished = true;
    await sendEvents(state);
    const body: z.input<typeof finishRunInput> = {
      ...identity(state.organizationId),
      runId: state.run.id,
      status,
    };
    if (error) body.error = error;
    try {
      await call("/device/finish", body);
    } catch {
      log("Could not report the end of a run. Its lease will expire.");
    }
    active.delete(state.sessionId);
    // Ends the native session. The next turn in this thread resumes it by ID.
    await execute({
      type: "disconnect",
      organizationId: state.organizationId,
      sessionId: state.sessionId,
    }).catch(() => {});
    wake();
  }

  async function start(run: ClaimedAgentRun, organizationId: string, harness: HarnessKind) {
    let ref: { id: string } | undefined;
    if (run.resumeSessionId)
      ref = await execute({ type: "resume", organizationId, sessionId: run.resumeSessionId })
        .then((value) => sessionRefSchema.parse(value))
        .catch(() => undefined);
    ref ??= sessionRefSchema.parse(
      await execute({ type: "start", organizationId, agentId: run.agentId }),
    );
    const state: ActiveRun = {
      run,
      organizationId,
      sessionId: ref.id,
      harness,
      text: "",
      lastActivity: null,
      queue: [],
      requests: new Map<string, { kind: "permission" | "input"; data: unknown }>(),
      finished: false,
    };
    active.set(ref.id, state);
    await call("/device/session", {
      ...identity(organizationId),
      runId: run.id,
      harnessSessionId: ref.id,
    });
    enqueue(state, "activity", "Working");
    await sendEvents(state);
    await execute({
      type: "prompt",
      organizationId,
      sessionId: ref.id,
      text: run.prompt.slice(0, 100_000),
    });
  }

  async function launch(
    run: ClaimedAgentRun,
    organizationId: string,
    kinds: Map<string, HarnessKind>,
  ) {
    const harness = kinds.get(run.agentId);
    try {
      if (!harness) throw new Error("Agent is not configured.");
      await start(run, organizationId, harness);
    } catch {
      const state = [...active.values()].find((entry) => entry.run.id === run.id);
      const error =
        "The agent could not start on this device. Check its harness sign-in and setup.";
      if (state) return finish(state, "failed", error);
      await call("/device/finish", {
        ...identity(organizationId),
        runId: run.id,
        status: "failed",
        error,
      }).catch(() => {});
    }
  }

  async function deliver(organizationId: string) {
    const parsed = deliveriesSchema.parse(
      await call("/device/deliveries", identity(organizationId)),
    );
    if (!parsed.success) return;
    for (const delivery of parsed.data) {
      const state = [...active.values()].find((entry) => entry.run.id === delivery.runId);
      const native = state?.requests.get(delivery.nativeRequestId);
      let status: "delivered" | "failed" = "failed";
      if (state && native)
        try {
          await execute({
            type: "respond",
            organizationId,
            sessionId: state.sessionId,
            requestId: delivery.nativeRequestId,
            response: nativeHarnessResponse(
              state.harness,
              native.kind,
              native.data,
              delivery.response,
            ),
          });
          state.requests.delete(delivery.nativeRequestId);
          status = "delivered";
        } catch {
          enqueue(
            state,
            "error",
            "The answer could not reach the agent. It may have stopped waiting.",
          );
        }
      await call("/device/requests/close", {
        ...identity(organizationId),
        requestId: delivery.requestId,
        status,
      }).catch(() => {});
    }
  }

  async function cycle() {
    const current = await session();
    const organizationId = current?.session.activeOrganizationId;
    if (!current || !organizationId) return;
    if (registeredFor !== current.user.id) {
      await call("/device/register", {
        installationId: options.installationId,
        name: options.device.name.slice(0, 200) || "Desktop",
        platform: options.device.platform.slice(0, 40) || "desktop",
      });
      registeredFor = current.user.id;
    }
    const claimed = claimSchema.parse(await call("/device/claim", identity(organizationId)));
    if (claimed.success && claimed.data.length) {
      // Synchronize writes current agent folders and skills before the turn starts.
      await options.harness.run("synchronize");
      const kinds = await harnessKindsByAgent();
      for (const run of claimed.data) void launch(run, organizationId, kinds);
    }
    if (active.size) await deliver(organizationId);
  }

  async function heartbeat() {
    const all = [...active.values()];
    for (const organizationId of new Set(all.map((state) => state.organizationId))) {
      const states = all.filter((state) => state.organizationId === organizationId);
      for (const state of states) await sendEvents(state);
      try {
        const parsed = heartbeatSchema.parse(
          await call("/device/heartbeat", {
            ...identity(organizationId),
            runIds: states.map((state) => state.run.id),
          }),
        );
        if (!parsed.success) continue;
        for (const id of parsed.data.cancelled) {
          const state = states.find((entry) => entry.run.id === id);
          if (!state) continue;
          await execute({ type: "interrupt", organizationId, sessionId: state.sessionId }).catch(
            () => {},
          );
          await finish(state, "cancelled");
        }
      } catch {
        log("Heartbeat failed. Runs continue until their lease expires.");
      }
    }
  }

  function wake() {
    if (stopped) return;
    if (cycling) {
      again = true;
      return;
    }
    cycling = cycle()
      .catch(() => log("Agent run check failed."))
      .finally(() => {
        cycling = undefined;
        if (again) {
          again = false;
          wake();
        }
      });
  }

  async function onRequest(state: ActiveRun, event: Extract<HarnessEvent, { type: "request" }>) {
    const payload = normalizeHarnessRequest(state.harness, event.kind, event.data);
    if (!payload) {
      enqueue(state, "error", "The agent asked for input that Startup OS cannot show yet.");
      return;
    }
    state.requests.set(event.requestId, { kind: event.kind, data: event.data });
    await sendEvents(state);
    const opened = openedSchema.safeParse(
      await call("/device/requests/open", {
        ...identity(state.organizationId),
        runId: state.run.id,
        nativeRequestId: event.requestId,
        payload,
      }).catch(() => null),
    );
    if (!opened.success || !opened.data.success)
      enqueue(state, "error", "Could not show the request.");
  }

  return {
    start() {
      stopped = false;
      timers.push(
        every(wake, 30_000),
        every(() => void heartbeat(), 20_000),
      );
      wake();
    },
    stop() {
      stopped = true;
      for (const clear of timers.splice(0)) clear();
      active.clear();
      registeredFor = undefined;
    },
    /** Realtime hints wake the runner. They carry no data; the server decides what to run. */
    onRealtime(event: RealtimeUpdate) {
      if (event.type === "ready" || (event.type === "change" && event.domain === "agent-runs"))
        wake();
    },
    onHarnessEvent(event: HarnessEvent) {
      const state = active.get(event.sessionId);
      if (!state || state.finished) return;
      switch (event.type) {
        case "text":
          state.text += event.text;
          return;
        case "activity": {
          const line = activityLine(state.harness, event.name, event.data);
          if (!line || line === state.lastActivity) return;
          state.lastActivity = line;
          flushText(state);
          enqueue(state, "activity", line);
          return;
        }
        case "request":
          void onRequest(state, event);
          return;
        case "turn-completed": {
          const status = {
            completed: "completed",
            failed: "failed",
            interrupted: "cancelled",
          } as const;
          void finish(
            state,
            status[event.status],
            event.status === "failed" ? "The agent's turn failed." : undefined,
          );
          return;
        }
        case "error":
          enqueue(state, "error", event.message);
          void finish(state, "failed", event.message);
          return;
        case "disconnected":
          void finish(state, "failed", "The agent's session closed.");
          return;
        case "session":
          return;
      }
    },
    /** For tests and diagnostics. */
    activeRuns: () => [...active.values()].map((state) => state.run.id),
  };
}

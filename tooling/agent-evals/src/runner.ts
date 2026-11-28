import {
  envelopeItem,
  localTime,
  renderEnvelope,
  sortItems,
  unsentAnswerNudge,
} from "@substrate/agent-host/envelope";
import {
  agentToolProvider,
  harnessConfiguration,
  managedPrefix,
  type TurnContext,
} from "@substrate/contracts/agent-tools";
import type { WorkspaceApiRequest, WorkspaceApiResult } from "@substrate/contracts/agent-tools/mcp";
import { mcpTools, type ServerToolName } from "@substrate/contracts/agent-tools/tools";
import type { AgentSourceMessage, EnvelopeItem } from "@substrate/contracts/agent-work";
import type { HostItem, HostTurn } from "@substrate/contracts/agent-work/control";
import type { AppId } from "@substrate/contracts/apps";
import type { HarnessEvent, HarnessKind, Usage } from "@substrate/contracts/harness-runtime";
import {
  AccessDeniedError,
  AppDisabledError,
  ConflictError,
  createRepositories,
  PermissionRequiredError,
  ValidationError,
} from "@substrate/database";
import {
  approvalPendingMessage,
  executeUserAgentTool,
  type FileContentReader,
} from "@substrate/database/mcp";
import { agentRoutines, organizationApps } from "@substrate/database/schema";
import { ensureUserAgentActor, fireRoutines, type Database } from "@substrate/database/trusted";
import { createHarnessHost } from "@substrate/harness-runtime";
import { acpRequestData } from "@substrate/harness-runtime/requests";

import type { Scenario, Step } from "./scenario.ts";
import { seedWorld, type World } from "./world.ts";
import { and, eq, inArray } from "drizzle-orm";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

export interface ModelTarget {
  label: string;
  harness: HarnessKind;
  model: string;
}

interface ToolCallRecord {
  tool: string;
  input: WorkspaceApiRequest["input"];
  ok: boolean;
  code?: string;
  message?: string;
  bytes: number;
  ms: number;
}

interface TurnRecord {
  envelope: string;
  status: string;
  error?: string;
  usage?: Usage;
  ms: number;
  calls: ToolCallRecord[];
  nativeItems: { type: string; title: string }[];
  nativeFailed: string[];
  nudged?: boolean;
  permissionPrompts: string[];
  text: string;
}

export interface RunRecord {
  scenario: string;
  model: string;
  agentId?: string;
  agentActorId?: string;
  turns: TurnRecord[];
  replies: string[];
  questions: string[];
  error?: string;
}

const optionalApps = ["tasks", "crm"] as const;
const turnTimeoutMs = 8 * 60_000;

function failure(error: Error): WorkspaceApiResult {
  const fail = (code: string, message: string) => ({
    success: false as const,
    error: { code, message },
  });
  if (error.name === "ZodError") return fail("INVALID_INPUT", "Invalid request input.");
  if (error instanceof ValidationError) return fail("INVALID_INPUT", error.message);
  if (error instanceof AccessDeniedError)
    return fail("NOT_FOUND", "Item not found or access denied.");
  if (error instanceof PermissionRequiredError) return fail("FORBIDDEN", error.message);
  if (error instanceof ConflictError) return fail("CONFLICT", error.message);
  if (error instanceof AppDisabledError) return fail("APP_DISABLED", error.message);
  console.error("[eval] internal tool error:", error);
  return fail("INTERNAL_ERROR", "Internal error.");
}

type Completed = Extract<HarnessEvent, { type: "turn.completed" }>["result"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runScenario(
  db: Database,
  directory: string,
  scenario: Scenario,
  target: ModelTarget,
): Promise<{ record: RunRecord; world: World | null; close: () => Promise<void> }> {
  const record: RunRecord = {
    scenario: scenario.id,
    model: target.label,
    turns: [],
    replies: [],
    questions: [],
  };
  let world: World | null = null;
  let close = async () => {};
  try {
    world = await seedWorld(db);
    const seeded = world;
    const { organizationId } = seeded;
    const userId = seeded.users.priya.userId;
    const installationId = crypto.randomUUID();
    const repositories = createRepositories(db);
    const ownerSession = await repositories.forOwnerSession({ userId, installationId });
    await ownerSession.devices.register({
      installationId,
      name: "Priya's laptop",
      platform: "win32",
    });
    const { result: agent } = await ownerSession.agents.saveAgent({
      name: "Scout",
      instructions: "",
      harness: target.harness,
      model: target.model,
      enabled: true,
      disabledApps: [],
      substrateGuide: true,
    });
    record.agentId = agent.id;
    const device = await repositories.forDeviceSession({ userId, organizationId, installationId });
    await scenario.setup?.(seeded);
    const appsOff = scenario.appsOff ?? [];
    if (appsOff.length)
      await db
        .update(organizationApps)
        .set({ enabled: false })
        .where(
          and(
            eq(organizationApps.organizationId, organizationId),
            inArray(organizationApps.appId, appsOff),
          ),
        );
    const enabledApps: AppId[] = [
      "messages",
      "agents",
      ...optionalApps.filter((app) => !appsOff.includes(app)),
    ];

    const reader: FileContentReader = {
      bytes: async (objectKey) => seeded.files.get(objectKey) ?? null,
      async preview(objectKey) {
        const bytes = seeded.files.get(objectKey);
        return bytes ? new Uint8Array(await sharp(bytes).webp().toBuffer()) : null;
      },
    };
    let calls: ToolCallRecord[] = [];
    const record_ = async (
      tool: string,
      input: WorkspaceApiRequest["input"],
      work: () => Promise<WorkspaceApiResult>,
    ) => {
      const started = Date.now();
      const result = await work();
      const call: ToolCallRecord = {
        tool,
        input,
        ok: result.success,
        bytes: JSON.stringify(result.success ? result.data : result.error).length,
        ms: Date.now() - started,
      };
      if (!result.success) {
        call.code = result.error.code;
        call.message = result.error.message;
      }
      calls.push(call);
      return result;
    };
    const workspace = (request: WorkspaceApiRequest) =>
      record_(request.tool, request.input, async () => {
        try {
          const { result } = await executeUserAgentTool(
            db,
            { organizationId, userId, userAgentId: request.agentId, installationId },
            // SAFETY: the provider routes only server tools to this handler.
            request.tool as ServerToolName,
            request.input,
            request.turn,
            reader,
          );
          if ("pending" in result)
            return {
              success: false,
              error: {
                code: "APPROVAL_PENDING",
                message: approvalPendingMessage,
                requestId: result.pending.requestId,
              },
            };
          // SAFETY: tool outputs are plain JSON objects.
          return { success: true, data: result.output as never };
        } catch (error) {
          return failure(error instanceof Error ? error : new Error(String(error)));
        }
      });
    const provider = agentToolProvider({
      workspace,
      local: (request) =>
        record_(request.tool, request.input, async () => ({
          success: true,
          data: { saved: true },
        })),
    });
    const host = await createHarnessHost<TurnContext>({
      accountDirectory: directory,
      tools: provider,
    });
    close = () => host.dispose();
    await host.configure(
      harnessConfiguration({
        organizationId,
        agents: [{ ...agent, model: target.model }],
        enabledApps,
      }),
    );
    const prefix = managedPrefix({
      agentName: agent.name,
      agentId: agent.id,
      organizationId,
      enabledApps,
    });

    const { result: dm } = await seeded.owner.messaging.createConversation({
      kind: "agent_dm",
      agentIds: [agent.id],
    });
    const agentActor = await ensureUserAgentActor(db, {
      organizationId,
      userId,
      userAgentId: agent.id,
    });
    record.agentActorId = agentActor.entityId;

    async function input(hostTurn: HostTurn) {
      const { session, turn } = hostTurn;
      const batch = hostTurn.items.filter((item) => !item.steered && item.status === "submitted");
      const ids = batch.flatMap((item: HostItem) => {
        if (item.sourceRef.source === "owner_message") return [item.sourceRef.messageId];
        if (item.sourceRef.source === "thread_context") return item.sourceRef.messageIds;
        return [];
      });
      const sources = await device.agentWork.loadSources(ids);
      const messages = new Map<string, AgentSourceMessage>(
        sources.result.messages.map((message) => [message.id, message]),
      );
      const items: EnvelopeItem[] = sortItems(batch).flatMap((item) => {
        const rendered = envelopeItem(item, { sessionKind: session.kind, messages });
        return rendered ? [rendered] : [];
      });
      if (session.kind === "thread" && !turn.handoff && session.origin?.threadId) {
        const { conversationId, threadId } = session.origin;
        const page = await seeded.owner.messaging.listMessages(conversationId, threadId);
        const missing = [...new Set([threadId, ...page.map((message) => message.id)])].filter(
          (id) => !messages.has(id),
        );
        const snapshot = await device.agentWork.loadSources(missing);
        items.unshift(
          ...snapshot.result.messages.map((message) => ({
            id: message.id,
            source: "thread_context" as const,
            author: message.author.name,
            authorKind: message.author.kind,
            conversationId: message.conversationId,
            threadId: message.threadId,
            messageId: message.id,
            body: message.body,
          })),
        );
      }
      return { items, batch };
    }

    async function runTurn(hostTurn: HostTurn): Promise<TurnRecord> {
      const { turn, session } = hostTurn;
      const loaded = await input(hostTurn);
      const envelope = renderEnvelope({
        time: new Date().toISOString(),
        local: localTime(Date.now()),
        session: session.kind,
        kind: turn.kind,
        attempt: turn.attempt,
        changes: [],
        items: loaded.items,
        resume: null,
      });
      await device.host.start(turn.id, { attempt: turn.attempt, droppedItemIds: [] });
      calls = [];
      const turnRecord: TurnRecord = {
        envelope,
        status: "failed",
        ms: 0,
        calls,
        nativeItems: [],
        nativeFailed: [],
        permissionPrompts: [],
        text: "",
      };
      const started = Date.now();
      const titles = new Map<string, string>();
      const done = Promise.withResolvers<Completed>();
      let settle = done.resolve;
      const unsubscribe = host.subscribe((event) => {
        if (event.sessionId !== session.id) return;
        switch (event.type) {
          case "text":
            turnRecord.text += `${event.text}\n`;
            return;
          case "item.started":
            turnRecord.nativeItems.push({ type: event.itemType, title: event.title });
            titles.set(event.itemId, event.title);
            return;
          case "item.completed":
            if (event.status === "failed")
              turnRecord.nativeFailed.push(titles.get(event.itemId) ?? event.itemId);
            return;
          case "request.opened": {
            const data = acpRequestData.parse(event.data);
            const options = data.options ?? [];
            const allow =
              options.find((option) => option.kind === "allow_once") ??
              options.find((option) => option.kind?.startsWith("allow_"));
            turnRecord.permissionPrompts.push(
              data.title ?? data.toolCall?.title ?? data.subject?.toolCall?.title ?? event.kind,
            );
            void host
              .execute({
                type: "respond",
                organizationId,
                sessionId: session.id,
                requestId: event.requestId,
                response:
                  event.kind === "permission" ? (allow?.optionId ?? null) : { action: "decline" },
              })
              .catch(() => {});
            return;
          }
          case "turn.completed":
            settle(event.result);
            return;
          case "session.closed":
            settle({ status: "failed", error: `session closed: ${event.reason}` });
            return;
          case "compaction":
          case "error":
          case "input.consumed":
          case "request.closed":
          case "turn.started":
          case "usage.updated":
        }
      });
      try {
        await host.execute({
          type: "open",
          organizationId,
          sessionId: session.id,
          agentId: agent.id,
          folder: "main",
          epoch: 0,
          prefix,
          mcpServers: [],
        });
        await host.execute({
          type: "turn",
          organizationId,
          sessionId: session.id,
          turnId: turn.id,
          generation: turn.generation,
          mode: turn.kind,
          input: { inputIds: loaded.batch.map((item) => item.id), text: envelope },
          context: { turnId: turn.id, attempt: turn.attempt },
        });
        const timeout = setTimeout(() => {
          void host
            .execute({ type: "interrupt", organizationId, sessionId: session.id, turnId: turn.id })
            .catch(() => {});
        }, turnTimeoutMs);
        let result = await done.promise;
        const published = calls.some(
          (call) => (call.tool === "reply" && call.ok) || call.code === "APPROVAL_PENDING",
        );
        const ownerTurn =
          turn.kind === "interactive" &&
          loaded.batch.some((item) => item.source === "owner_message");
        const unsent = result.status === "completed" && !published && !!turnRecord.text.trim();
        if (ownerTurn && unsent) {
          turnRecord.nudged = true;
          const again = Promise.withResolvers<Completed>();
          settle = again.resolve;
          await host.execute({
            type: "turn",
            organizationId,
            sessionId: session.id,
            turnId: turn.id,
            generation: turn.generation,
            mode: turn.kind,
            input: { inputIds: loaded.batch.map((item) => item.id), text: unsentAnswerNudge },
            context: { turnId: turn.id, attempt: turn.attempt },
          });
          result = await again.promise;
        }
        clearTimeout(timeout);
        turnRecord.status = result.status;
        turnRecord.error = result.error;
        turnRecord.usage = result.usage;
      } catch (error) {
        turnRecord.error = error instanceof Error ? error.message : String(error);
      } finally {
        unsubscribe();
        turnRecord.ms = Date.now() - started;
      }
      const asked = calls.some((call) => call.tool === "reply" && call.ok && call.input.ask);
      const proposed = calls.some((call) => call.code === "APPROVAL_PENDING");
      const replied = calls.some((call) => call.tool === "reply" && call.ok);
      let outcome: "asked" | "proposed" | "replied" | "silent" = "silent";
      if (asked) outcome = "asked";
      else if (proposed) outcome = "proposed";
      else if (replied) outcome = "replied";
      await device.host.finish(turn.id, {
        attempt: turn.attempt,
        status: turnRecord.status === "completed" ? "completed" : "failed",
        outcome,
        error: turnRecord.error?.slice(0, 2000) ?? null,
        attentionReason: null,
        interruption: null,
        consumedItemIds: loaded.batch.map((item) => item.id),
        stillQueuedItemIds: [],
        usage: null,
      });
      return turnRecord;
    }

    async function claim() {
      for (let attempt = 0; attempt < 40; attempt++) {
        const claimed = await device.host.claim({});
        const first = claimed.result.at(0);
        if (first) return first;
        await sleep(500);
      }
      return null;
    }

    const places: { conversationId: string; threadId: string | null }[] = [];
    const step = async (entry: Step) => {
      if (entry.type === "message") {
        const sent = await seeded.owner.messaging.sendMessage(dm.id, entry.text);
        places.push({ conversationId: dm.id, threadId: null });
        return sent;
      }
      if (entry.type === "routine") {
        await seeded.owner.agentWork.createRoutine(agent.id, {
          name: "Eval routine",
          prompt: entry.prompt,
          cron: "* * * * *",
          timezone: "UTC",
          enabled: true,
          destination: { conversationId: dm.id, threadId: null },
        });
        await db
          .update(agentRoutines)
          .set({ nextFireAt: new Date(Date.now() - 1_000) })
          .where(eq(agentRoutines.userAgentId, agent.id));
        return fireRoutines(db);
      }
      if (entry.type === "mention") {
        const conversationId = seeded.conversations[entry.conversation]!;
        await seeded.owner.messaging.addAgent(conversationId, agent.id);
        const threadId = seeded.messages[entry.replyTo]!;
        places.push({ conversationId, threadId });
        return seeded.owner.messaging.sendMessage(
          conversationId,
          `@[agent:${agentActor.entityId}] ${entry.text}`,
          threadId,
        );
      }
      const conversations = [...new Set([dm.id, ...places.map((place) => place.conversationId)])];
      const requests = (
        await Promise.all(
          conversations.map((id) => seeded.owner.agentWork.listConversationRequests(id)),
        )
      ).flat();
      const open = requests.find((request) => request.status === "pending");
      if (!open) return null;
      if (entry.type === "answer")
        return seeded.owner.agentWork.respondToRequest(open.id, {
          type: "questions",
          answers: { answer: [entry.text] },
        });
      return entry.type === "approve"
        ? seeded.owner.agentWork.approveProposal(open.id)
        : seeded.owner.agentWork.declineProposal(open.id);
    };

    for (const entry of scenario.steps) {
      const acted = await step(entry);
      if (acted === null) continue;
      const hostTurn = await claim();
      if (!hostTurn) {
        record.error = `No turn was claimed for step ${entry.type}.`;
        break;
      }
      const turnRecord = await runTurn(hostTurn);
      record.turns.push(turnRecord);
      if (turnRecord.status !== "completed") {
        record.error = turnRecord.error ?? turnRecord.status;
        break;
      }
    }

    const seen = new Set<string>();
    for (const place of [{ conversationId: dm.id, threadId: null }, ...places]) {
      const key = `${place.conversationId}:${place.threadId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const page = await seeded.owner.messaging.listMessages(
        place.conversationId,
        place.threadId ?? undefined,
      );
      for (const message of page)
        if (message.authorActorEntityId === agentActor.entityId)
          record.replies.push(await readable(seeded, message.body));
    }
    for (const turn of record.turns)
      for (const call of turn.calls) {
        if (call.tool !== "reply" || !call.ok) continue;
        const reply = mcpTools.reply.input.safeParse(call.input);
        if (reply.data?.ask) record.questions.push(reply.data.ask.question);
      }
  } catch (error) {
    record.error = error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
  return { record, world, close };
}

async function readable(world: World, body: string) {
  const people = new Map(
    (["priya", "marcus", "dana", "tom"] as const).map((key) => [
      world.actors[key],
      world.users[key].name,
    ]),
  );
  let text = body;
  for (const [token, kind, id] of body.matchAll(/@\[(task|project|person):([0-9a-f-]{36})\]/g)) {
    const name = await mentionedName(
      world,
      people,
      kind === "task" || kind === "project" ? kind : "person",
      id!,
    );
    if (name) text = text.replaceAll(token, name);
  }
  return text;
}

async function mentionedName(
  world: World,
  people: Map<string, string>,
  kind: "task" | "project" | "person",
  id: string,
): Promise<string | undefined> {
  try {
    if (kind === "task") return (await world.owner.tasks.get(id)).title;
    if (kind === "project") return (await world.owner.projects.get(id)).name;
    return people.get(id);
  } catch {
    return undefined;
  }
}

export async function runDirectory(root: string, scenario: string, model: string) {
  const directory = join(root, `${scenario}-${model}-${crypto.randomUUID().slice(0, 6)}`);
  await mkdir(directory, { recursive: true });
  return directory;
}

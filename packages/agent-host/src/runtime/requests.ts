import type { NewTurnEvent } from "@substrate/client-storage/agent-work";
import {
  blockingRequestTimeoutMs,
  denyResponse,
  type AgentRequestPayload,
  type AgentRequestResponse,
} from "@substrate/contracts/agent-work";
import type { HarnessEventBody } from "@substrate/contracts/harness-runtime";
import {
  acpRequestData,
  acpRequestResponse,
  asksForSecret,
  normalizeAcpRequest,
  type AcpRequestData,
} from "@substrate/harness-runtime/requests";

import type { LiveTurn, RuntimeContext } from "./context.ts";

type RequestOpened = Extract<HarnessEventBody, { type: "request.opened" }>;
type TurnRef = { turnId: string; attempt: number };

interface OpenRequest {
  serverId: string | null;
  nativeRequestId: string;
  turnId: string;
  sessionId: string;
  userAgentId: string;
  kind: RequestOpened["kind"];
  data: AcpRequestData;
  payload: AgentRequestPayload;
  live: LiveTurn;
  timer: () => void;
}

function fallbackResponse(payload: AgentRequestPayload): AgentRequestResponse {
  return denyResponse(payload) ?? { type: "questions", answers: {} };
}

export function createRequestBridge(
  context: RuntimeContext,
  turns: {
    report(live: LiveTurn, state: "waiting" | "running"): void;
    isLive(live: LiveTurn): boolean;
  },
) {
  const open = new Map<string, OpenRequest>();
  const key = (turnId: string, nativeRequestId: string) => `${turnId}:${nativeRequestId}`;
  const append = (turn: TurnRef, events: NewTurnEvent[]) =>
    context.store.events.append(context.organizationId, turn, events, context.now());

  async function respond(request: OpenRequest, response: AgentRequestResponse) {
    await context.harness.execute({
      type: "respond",
      organizationId: context.organizationId,
      sessionId: request.sessionId,
      requestId: request.nativeRequestId,
      response: acpRequestResponse(request.kind, request.data, response),
    });
  }

  function stillWaits(turnId: string) {
    return [...open.values()].some((entry) => entry.turnId === turnId);
  }

  async function settle(
    request: OpenRequest,
    response: AgentRequestResponse,
    status: "delivered" | "expired",
  ) {
    open.delete(key(request.turnId, request.nativeRequestId));
    request.timer();
    const delivered = await respond(request, response).then(
      () => true,
      () => false,
    );
    if (request.serverId)
      await context.server
        .closeRequest(
          context.organizationId,
          request.serverId,
          delivered || status === "expired" ? status : "orphaned",
        )
        .catch(() => context.log("Could not close an agent request."));
    await append(request.live, [
      {
        kind: "request_resolved",
        data: { requestId: request.serverId ?? request.nativeRequestId },
      },
    ]);
    if (!stillWaits(request.turnId)) turns.report(request.live, "running");
    context.progressed({ userAgentId: request.userAgentId, turnId: request.turnId });
  }

  return {
    async opened(live: LiveTurn, event: Pick<RequestOpened, "requestId" | "kind" | "data">) {
      const data = acpRequestData.parse(event.data);
      const payload = normalizeAcpRequest(event.kind, data);
      if (!payload) {
        await context.harness
          .execute({
            type: "respond",
            organizationId: context.organizationId,
            sessionId: live.sessionId,
            requestId: event.requestId,
            response: event.kind === "permission" ? null : { action: "decline" },
          })
          .catch(() => context.log("Could not decline an agent request."));
        const secret = event.kind === "input" && asksForSecret(data);
        await append(live, [
          {
            kind: "error",
            data: secret
              ? {
                  code: "secret_request",
                  message: "The agent asked for a secret. Substrate does not collect secrets.",
                }
              : {
                  code: "unsupported_request",
                  message: "The agent asked for input that Substrate cannot show.",
                },
          },
        ]);
        return;
      }
      const request: OpenRequest = {
        serverId: null,
        nativeRequestId: event.requestId,
        turnId: live.turnId,
        sessionId: live.sessionId,
        userAgentId: live.userAgentId,
        kind: event.kind,
        data,
        payload,
        live,
        timer: () => {},
      };
      if (live.kind === "unattended") {
        await respond(request, fallbackResponse(payload)).catch(() => {});
        await append(live, [
          { kind: "note", data: { text: "Denied a prompt: background work cannot ask." } },
        ]);
        return;
      }
      const entry = key(live.turnId, event.requestId);
      open.set(entry, request);
      request.timer = context.later(() => {
        if (open.get(entry) === request) void settle(request, fallbackResponse(payload), "expired");
      }, blockingRequestTimeoutMs);
      let opened: { id: string };
      try {
        const input: Parameters<typeof context.server.openRequest>[0] = {
          organizationId: context.organizationId,
          turnId: live.turnId,
          epoch: live.epoch,
          kind: event.kind === "permission" ? "permission" : "question",
          mode: "blocking",
          nativeRequestId: event.requestId,
          payload,
        };
        const anchor = live.sourceMessages.at(-1);
        if (anchor) input.anchorMessageId = anchor.messageId;
        if (live.conversationId) input.conversationId = live.conversationId;
        if (live.threadId) input.threadId = live.threadId;
        opened = await context.server.openRequest(input);
      } catch {
        if (open.get(entry) === request) {
          open.delete(entry);
          request.timer();
          await respond(request, fallbackResponse(payload)).catch(() => {});
        }
        await append(live, [
          {
            kind: "error",
            data: { code: "request_failed", message: "Could not show the request. Denied it." },
          },
        ]);
        context.progressed({ userAgentId: live.userAgentId, turnId: live.turnId });
        return;
      }
      if (open.get(entry) !== request || !turns.isLive(live)) {
        if (open.get(entry) === request) {
          open.delete(entry);
          request.timer();
        }
        await context.server
          .closeRequest(context.organizationId, opened.id, "cancelled")
          .catch(() => context.log("Could not close an agent request."));
        return;
      }
      request.serverId = opened.id;
      await append(live, [
        {
          kind: "request",
          data: {
            requestId: opened.id,
            kind: event.kind === "permission" ? "permission" : "question",
          },
        },
      ]);
      turns.report(live, "waiting");
      context.progressed({ userAgentId: live.userAgentId, turnId: live.turnId });
    },
    async deliver() {
      const answers = await context.server.requestAnswers(context.organizationId);
      for (const answer of answers) {
        const request = open.get(key(answer.turnId, answer.nativeRequestId));
        if (request) await settle(request, answer.response, "delivered");
        else
          await context.server
            .closeRequest(context.organizationId, answer.requestId, "orphaned")
            .catch(() => {});
      }
    },
    async withdrawn(live: LiveTurn, nativeRequestId: string) {
      const entry = key(live.turnId, nativeRequestId);
      const request = open.get(entry);
      if (!request) return;
      open.delete(entry);
      request.timer();
      if (!request.serverId) return;
      await context.server
        .closeRequest(context.organizationId, request.serverId, "cancelled")
        .catch(() => context.log("Could not close an agent request."));
      await append(live, [
        { kind: "note", data: { text: "The agent withdrew its request." } },
        { kind: "request_resolved", data: { requestId: request.serverId } },
      ]);
      if (!stillWaits(request.turnId)) turns.report(live, "running");
      context.progressed({ userAgentId: request.userAgentId, turnId: request.turnId });
    },
    async closeTurn(turnId: string, status: "cancelled" | "orphaned" = "cancelled") {
      for (const [entry, request] of open) {
        if (request.turnId !== turnId) continue;
        open.delete(entry);
        request.timer();
        if (!request.serverId) continue;
        await context.server
          .closeRequest(context.organizationId, request.serverId, status)
          .catch(() => context.log("Could not close an agent request."));
        await append(request.live, [
          { kind: "request_resolved", data: { requestId: request.serverId } },
        ]).catch(() => {});
      }
    },
    async closeOrphans(turn: TurnRef) {
      const events = await context.store.events.ofKinds(context.organizationId, turn.turnId, [
        "request",
        "request_resolved",
      ]);
      const resolved = new Set(
        events.flatMap((event) =>
          event.kind === "request_resolved" ? [event.data.requestId] : [],
        ),
      );
      for (const event of events) {
        if (event.kind !== "request" || resolved.has(event.data.requestId)) continue;
        if (event.data.kind !== "permission" && event.data.kind !== "question") continue;
        const closed = await context.server
          .closeRequest(context.organizationId, event.data.requestId, "orphaned")
          .then(
            () => true,
            () => false,
          );
        if (!closed) {
          context.log("Could not close an agent request.");
          continue;
        }
        await append({ turnId: turn.turnId, attempt: event.attempt }, [
          { kind: "request_resolved", data: { requestId: event.data.requestId } },
        ]);
      }
    },
    waiting() {
      return open.size > 0;
    },
    dispose() {
      for (const request of open.values()) request.timer();
      open.clear();
    },
  };
}
export type RequestBridge = ReturnType<typeof createRequestBridge>;

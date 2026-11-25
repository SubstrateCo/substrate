import {
  acpRequestData,
  acpRequestResponse,
  asksForSecret,
  blockingRequestTimeoutMs,
  denyResponse,
  liveTurnStatuses,
  normalizeAcpRequest,
  type AcpRequestData,
  type AgentRequestPayload,
  type AgentRequestResponse,
} from "@substrate/contracts/agent-work";
import type { HarnessEventBody } from "@substrate/contracts/harness";

import type { LiveTurn, RuntimeContext } from "./context.ts";

type RequestOpened = Extract<HarnessEventBody, { type: "request.opened" }>;

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

/** The answer for a request that nobody answered: deny, or empty answers for questions. */
function fallbackResponse(payload: AgentRequestPayload): AgentRequestResponse {
  return denyResponse(payload) ?? { type: "questions", answers: {} };
}

/**
 * Native blocking prompts. The desktop holds the native callback while the owner answers on any
 * device. Interactive turns open a server request; unattended turns never ask, so anything that
 * reaches here is denied. Requests expire after ten minutes and are denied.
 */
export function createRequestBridge(context: RuntimeContext) {
  const open = new Map<string, OpenRequest>();
  const key = (turnId: string, nativeRequestId: string) => `${turnId}:${nativeRequestId}`;

  async function respond(request: OpenRequest, response: AgentRequestResponse) {
    await context.harness.execute({
      type: "respond",
      organizationId: context.organizationId,
      sessionId: request.sessionId,
      requestId: request.nativeRequestId,
      response: acpRequestResponse(request.kind, request.data, response),
    });
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
    await context.store.events.append(
      request.turnId,
      [
        {
          kind: "request_resolved",
          data: { requestId: request.serverId ?? request.nativeRequestId },
        },
      ],
      context.now(),
    );
    if (![...open.values()].some((entry) => entry.turnId === request.turnId))
      await context.store.turns.running(request.turnId, context.now());
    context.changed({ userAgentId: request.userAgentId, turnId: request.turnId });
  }

  return {
    async opened(live: LiveTurn, event: Pick<RequestOpened, "requestId" | "kind" | "data">) {
      const data = acpRequestData.parse(event.data);
      const payload = normalizeAcpRequest(event.kind, data);
      const now = context.now();
      if (!payload) {
        // Nobody can answer it: decline now, so the agent goes on instead of waiting.
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
        await context.store.events.append(
          live.turnId,
          [
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
          ],
          now,
        );
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
      if (live.kind === "unattended" || payload.type === "proposal") {
        // The no-ask profile should have denied it natively. Deny it here as well.
        await respond(request, fallbackResponse(payload)).catch(() => {});
        await context.store.events.append(
          live.turnId,
          [{ kind: "note", data: { text: "Denied a prompt: background work cannot ask." } }],
          now,
        );
        return;
      }
      const entry = key(live.turnId, event.requestId);
      open.set(entry, request);
      request.timer = context.later(() => {
        if (open.get(entry) === request) void settle(request, fallbackResponse(payload), "expired");
      }, blockingRequestTimeoutMs);
      const turn = await context.store.turns.get(live.turnId);
      const session = await context.store.sessions.get(live.sessionId);
      let opened: { id: string };
      try {
        const input: Parameters<typeof context.server.openRequest>[0] = {
          organizationId: context.organizationId,
          userAgentId: live.userAgentId,
          sessionKey: session!.key,
          turnId: live.turnId,
          epoch: live.epoch,
          kind: event.kind === "permission" ? "permission" : "question",
          mode: "blocking",
          nativeRequestId: event.requestId,
          // SAFETY: proposals were handled above; blocking payloads are approvals or questions.
          payload: payload as Exclude<AgentRequestPayload, { type: "proposal" }>,
        };
        const anchor = turn?.sourceMessages.at(-1);
        if (anchor) input.anchorMessageId = anchor.messageId;
        if (live.conversationId) input.conversationId = live.conversationId;
        if (live.threadId) input.threadId = live.threadId;
        opened = await context.server.openRequest(input);
      } catch {
        // Nobody can answer a request the owner cannot see: deny it now, not in ten minutes.
        if (open.get(entry) === request) {
          open.delete(entry);
          request.timer();
          await respond(request, fallbackResponse(payload)).catch(() => {});
        }
        await context.store.events.append(
          live.turnId,
          [
            {
              kind: "error",
              data: { code: "request_failed", message: "Could not show the request. Denied it." },
            },
          ],
          context.now(),
        );
        context.changed({ userAgentId: live.userAgentId, turnId: live.turnId });
        return;
      }
      const current = await context.store.turns.get(live.turnId);
      if (open.get(entry) !== request || !current || !liveTurnStatuses.includes(current.status)) {
        // The turn ended or the request expired while the server opened it.
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
      await context.store.turns.waiting(live.turnId, context.now(), [
        {
          kind: "request",
          data: {
            requestId: opened.id,
            kind: event.kind === "permission" ? "permission" : "question",
          },
        },
      ]);
      context.changed({ userAgentId: live.userAgentId, turnId: live.turnId });
    },
    /** Delivers answers the owner gave on any device. Answers for gone callbacks are orphaned. */
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
    /**
     * The agent withdrew a request, or it timed out natively: the owner can no longer answer it.
     * A request the server is still opening is cancelled once it opens.
     */
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
      await context.store.events.append(
        request.turnId,
        [
          { kind: "note", data: { text: "The agent withdrew its request." } },
          { kind: "request_resolved", data: { requestId: request.serverId } },
        ],
        context.now(),
      );
      if (![...open.values()].some((other) => other.turnId === request.turnId))
        await context.store.turns.running(request.turnId, context.now());
      context.changed({ userAgentId: request.userAgentId, turnId: request.turnId });
    },
    /** The turn ended: its native callbacks are gone. Interrupted turns orphan their requests. */
    async closeTurn(turnId: string, status: "cancelled" | "orphaned" = "cancelled") {
      for (const [entry, request] of open) {
        if (request.turnId !== turnId) continue;
        open.delete(entry);
        request.timer();
        if (!request.serverId) continue;
        await context.server
          .closeRequest(context.organizationId, request.serverId, status)
          .catch(() => context.log("Could not close an agent request."));
        await context.store.events
          .append(
            turnId,
            [{ kind: "request_resolved", data: { requestId: request.serverId } }],
            context.now(),
          )
          .catch(() => {});
      }
    },
    /**
     * After an app start: blocking requests of turns that died with the harness process have no
     * native callback anymore. Their server requests are closed as orphaned.
     */
    async closeOrphans(turnIds: string[]) {
      for (const turnId of turnIds) {
        const events = await context.store.events.ofKinds(turnId, ["request", "request_resolved"]);
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
          await context.store.events.append(
            turnId,
            [{ kind: "request_resolved", data: { requestId: event.data.requestId } }],
            context.now(),
          );
        }
      }
    },
    /** Whether a native callback waits for the owner's answer. */
    waiting() {
      return open.size > 0;
    },
    openCount(userAgentId: string) {
      return [...open.values()].filter((request) => request.userAgentId === userAgentId).length;
    },
    dispose() {
      for (const request of open.values()) request.timer();
      open.clear();
    },
  };
}
export type RequestBridge = ReturnType<typeof createRequestBridge>;

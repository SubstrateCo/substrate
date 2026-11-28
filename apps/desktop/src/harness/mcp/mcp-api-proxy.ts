import {
  workspaceApiResult,
  workspaceApiRequest,
  type WorkspaceApiProxy,
  type WorkspaceApiRequest,
  type WorkspaceApiResult,
} from "@substrate/contracts/agent-tools/mcp";
import { mcpTools } from "@substrate/contracts/agent-tools/tools";
import { approvalPendingCode, type ProposalOutcome } from "@substrate/contracts/agent-work";

import { approvalPollMs, approvalWaitMs } from "./request-limits.ts";

export interface DecidedInTurn {
  requestId: string;
}

export interface ApprovalWaiter {
  status(
    organizationId: string,
    requestId: string,
  ): Promise<{ status: string; outcome: ProposalOutcome | null }>;
  waiting(request: WorkspaceApiRequest, requestId: string): (() => void) | null;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

const declined: WorkspaceApiResult = {
  success: false,
  error: { code: "DECLINED", message: "Your owner declined this call. Do not retry it." },
};
const unreadable: WorkspaceApiResult = {
  success: false,
  error: {
    code: "RESULT_UNAVAILABLE",
    message:
      "Your owner approved this call and it ran, but its result could not be read. Do not retry it.",
  },
};

function decidedResult(
  request: WorkspaceApiRequest,
  state: { status: string; outcome: ProposalOutcome | null },
): WorkspaceApiResult | null {
  const { outcome } = state;
  if (!outcome) return null;
  if (outcome.status === "declined") return declined;
  if (outcome.status === "failed")
    return { success: false, error: { code: "FAILED", message: outcome.error } };
  const data = mcpTools[request.tool].output.safeParse(outcome.result);
  if (outcome.result === undefined || !data.success) return unreadable;
  return { success: true, data: outcome.result };
}

const closedStatuses = new Set(["cancelled", "expired"]);

async function readDecision(
  approval: ApprovalWaiter,
  request: WorkspaceApiRequest,
  requestId: string,
): Promise<WorkspaceApiResult | "closed" | null> {
  const state = await approval.status(request.organizationId, requestId).catch(() => null);
  if (!state) return null;
  if (closedStatuses.has(state.status)) return "closed";
  return decidedResult(request, state);
}

async function awaitDecision(
  approval: ApprovalWaiter,
  request: WorkspaceApiRequest,
  requestId: string,
  isActive: () => boolean,
  wait: boolean,
  startedAt: number,
): Promise<WorkspaceApiResult | null> {
  const now = approval.now ?? Date.now;
  const sleep =
    approval.sleep ??
    ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const deadline = startedAt + approvalWaitMs;
  for (;;) {
    const decision = await readDecision(approval, request, requestId);
    if (decision === "closed") return null;
    if (decision) return decision;
    if (!wait || !isActive() || now() + approvalPollMs > deadline) return null;
    await sleep(approvalPollMs);
    if (!isActive()) return null;
  }
}

export function createMcpApiProxy(options: {
  backend: string;
  isActive: () => boolean;
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
  approval?: ApprovalWaiter;
  onResult?: (
    request: Parameters<WorkspaceApiProxy>[0],
    result: Awaited<ReturnType<WorkspaceApiProxy>>,
    decided?: DecidedInTurn,
  ) => void | Promise<void>;
}): WorkspaceApiProxy {
  return async (raw) => {
    const request = workspaceApiRequest.parse(raw);
    mcpTools[request.tool].input.parse(request.input);
    if (!options.isActive()) throw new Error("MCP connection closed.");
    const startedAt = (options.approval?.now ?? Date.now)();
    const url = new URL("/api/v1/mcp/call", options.backend);
    const init: RequestInit = {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    };
    const response = await options.fetchAPI(url.href, init);
    const result = workspaceApiResult.parse(await response.json());
    if (!result.success && result.error.code === "WORKSPACE_CHANGED")
      return {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Workspace changed. Start a new agent run in this workspace.",
        },
      };
    const requestId =
      !result.success && result.error.code === approvalPendingCode ? result.error.requestId : null;
    if (!requestId || !options.approval) {
      await options.onResult?.(request, result);
      return result;
    }
    const release = options.approval.waiting(request, requestId);
    const wait = release !== null;
    try {
      const decided = await awaitDecision(
        options.approval,
        request,
        requestId,
        options.isActive,
        wait,
        startedAt,
      );
      if (decided) await options.onResult?.(request, decided, { requestId });
      else await options.onResult?.(request, result);
      return decided ?? result;
    } finally {
      release?.();
    }
  };
}

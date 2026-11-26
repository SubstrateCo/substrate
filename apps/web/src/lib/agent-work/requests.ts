import type { AgentRequestView } from "@substrate/contracts/agent-work";

/** One line that says how a request ended, or that it still waits. */
export function requestOutcome(request: AgentRequestView) {
  switch (request.status) {
    case "pending":
      return "Waiting for your answer";
    case "expired":
      return "Expired without an answer";
    case "cancelled":
      return "Cancelled";
    case "orphaned":
      return "No longer needed";
    case "undelivered":
      return `Your answer arrived after the agent stopped waiting · ${requestAnswer(request)}`;
    case "resolved":
    case "delivered":
      break;
  }
  return requestAnswer(request);
}

function requestAnswer(request: AgentRequestView) {
  const response = request.response;
  const payload = request.payload;
  if (payload?.type === "approval" && response?.type === "approval") {
    const option = payload.options.find((item) => item.id === response.optionId);
    return `Answered: ${option?.label ?? response.optionId}`;
  }
  if (response?.type === "questions") {
    const answers = Object.values(response.answers).flat();
    return answers.length ? `Answered: ${answers.join(", ")}` : "Answered";
  }
  return "Answered";
}

/**
 * When a blocking request stops waiting. Async questions wait until the owner answers, so they
 * have no deadline in the client.
 */
export function requestDeadline(request: Pick<AgentRequestView, "mode" | "expiresAt">) {
  if (request.mode !== "blocking" || !request.expiresAt) return null;
  return Date.parse(request.expiresAt);
}

export const isOpenRequest = (request: Pick<AgentRequestView, "status">) =>
  request.status === "pending";

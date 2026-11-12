import type { AgentCallStatus, AgentCallStatusView } from "@substrate/contracts/agent-work";

const labels: Record<AgentCallStatus, string> = {
  waiting: "Waiting",
  queued: "Queued",
  declined: "Declined",
  expired: "Expired",
  answered: "Answered",
};

export function CallStatus({ call }: { call: AgentCallStatusView }) {
  return (
    <p className="text-xs text-muted-foreground" role="status">
      {call.agent.name} · {labels[call.status]}
    </p>
  );
}

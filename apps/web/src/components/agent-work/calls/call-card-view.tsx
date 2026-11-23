import type { AgentInvocationView, DecideInvocationInput } from "@substrate/contracts/agent-work";

import { useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { FormMessage } from "@/components/feedback/form-message";
import { Button } from "@/components/ui/button";

export function CallCardView({
  call,
  pending,
  error,
  onDecide,
}: {
  call: AgentInvocationView;
  pending: boolean;
  error: Error | null;
  onDecide: (decision: DecideInvocationInput["decision"]) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid gap-4 rounded-xl border bg-card p-5">
      <p className="text-sm font-medium">
        {call.caller.name} wants to call {call.agent.name}
      </p>
      {call.place.access === "visible" && call.preview && (
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{call.preview}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => onDecide("approve")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirm(true)}>
          Always allow {call.caller.name}
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDecide("decline")}>
          Decline
        </Button>
      </div>
      <FormMessage
        error={error}
        errorDescription="This call may have changed or expired. We refreshed the list. Try again if it is still waiting."
      />
      {confirm && (
        <ConfirmDialog
          title={`Always allow ${call.caller.name}?`}
          description="This approves this call and lets future calls skip approval under Ask me first. The agent works with your full access."
          confirmLabel={`Always allow ${call.caller.name}`}
          pending={pending}
          error={error}
          errorDescription="We couldn’t allow this call. It may have changed or expired."
          onConfirm={() => onDecide("always_allow")}
          onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

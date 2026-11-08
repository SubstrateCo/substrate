import { ConfirmDialog } from "./confirm-dialog";
import { PendingButton } from "@/components/feedback/pending-button";
import { Spinner } from "@/components/ui/spinner";
import { Bot } from "lucide-react";

type ConversationAgentOption = {
  agentId: string;
  name: string;
  /** The agent's actor when it is a member here. */
  actorId?: string;
};

export function AgentMembersDialog({
  name,
  agents,
  loading,
  error,
  busyId,
  onAdd,
  onRemove,
  onClose,
}: {
  name: string;
  agents: ConversationAgentOption[];
  loading: boolean;
  error?: Error | null;
  busyId?: string;
  onAdd: (agentId: string) => void;
  onRemove: (actorId: string) => void;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      title={`Your agents in ${name}`}
      description="Add an agent so you can mention it here. It reads with your access and runs on your desktop."
      pendingLabel="Saving"
      pending={false}
      error={error}
      onConfirm={onClose}
      onClose={onClose}
    >
      {loading && <Spinner aria-label="Loading your agents" className="mx-auto" />}
      {!loading && agents.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You have no enabled agents. Create one in your agent settings.
        </p>
      )}
      {!loading && agents.length > 0 && (
        <ul className="grid gap-1">
          {agents.map((agent) => (
            <li key={agent.agentId} className="flex items-center gap-2 py-1">
              <Bot aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{agent.name}</span>
                {agent.actorId && (
                  <span className="block text-xs text-muted-foreground">In this conversation</span>
                )}
              </span>
              {agent.actorId ? (
                <PendingButton
                  size="sm"
                  variant="outline"
                  disabled={!!busyId}
                  pending={busyId === agent.agentId}
                  pendingLabel="Removing…"
                  onClick={() => onRemove(agent.actorId!)}
                >
                  Remove
                </PendingButton>
              ) : (
                <PendingButton
                  size="sm"
                  disabled={!!busyId}
                  pending={busyId === agent.agentId}
                  pendingLabel="Adding…"
                  onClick={() => onAdd(agent.agentId)}
                >
                  Add
                </PendingButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </ConfirmDialog>
  );
}

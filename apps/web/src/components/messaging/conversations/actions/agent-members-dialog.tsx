import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { PendingButton } from "@/components/feedback/pending-button";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Spinner } from "@/components/ui/spinner";

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
  onOpenAgents,
  onClose,
}: {
  name: string;
  agents: ConversationAgentOption[];
  loading: boolean;
  error?: Error | null;
  busyId?: string;
  onAdd: (agentId: string) => void;
  onRemove: (actorId: string) => void;
  /** Opens the Agents app, where the person can create an agent. */
  onOpenAgents: () => void;
  onClose: () => void;
}) {
  const common = {
    title: `Your agents in ${name}`,
    description:
      "Add an agent so you can mention it here. It reads with your access and runs on your desktop.",
    error,
    errorDescription: "We couldn’t update your agents here. Try again.",
    onClose,
  };
  if (!loading && agents.length === 0)
    return (
      <ConfirmDialog
        {...common}
        confirmLabel="Open Agents"
        pendingLabel="Opening…"
        onConfirm={onOpenAgents}
      >
        <p className="text-sm text-muted-foreground">
          You don’t have an agent yet. Create one in Agents, then come back to add it here.
        </p>
      </ConfirmDialog>
    );
  return (
    <ConfirmDialog {...common}>
      {loading && <Spinner aria-label="Loading your agents" className="mx-auto" />}
      {!loading && (
        <ul className="-mx-2 grid gap-0.5">
          {agents.map((agent) => (
            <li key={agent.agentId} className="flex h-10 items-center gap-2 rounded-md px-2">
              <PersonAvatar name={agent.name} agent />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{agent.name}</span>
              {agent.actorId && (
                <span className="text-xs text-muted-foreground">In this conversation</span>
              )}
              {agent.actorId ? (
                <PendingButton
                  size="sm"
                  variant="destructive-ghost"
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
                  variant="outline"
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

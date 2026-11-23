import { useRef } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { LoadingState } from "@/components/feedback/loading-state";
import { PendingButton } from "@/components/feedback/pending-button";
import { useStateDialog } from "@/components/feedback/use-state-dialog";
import { actionRow, RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "cn";
import { UserMinus } from "lucide-react";

type ConversationAgentOption = {
  agentId: string;
  name: string;
  image?: string | null;
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
  onRestoreFocus,
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
  onRestoreFocus?: () => void;
}) {
  // Focus returns to the row button. It is replaced by a spinner while the agent is removed, so
  // then the list is the nearest place left.
  const list = useRef<HTMLUListElement>(null);
  const removal = useStateDialog<ConversationAgentOption>(list);
  const removing = removal.value;
  const common = {
    title: `Your agents in ${name}`,
    description:
      "Add an agent so you can mention it here. It reads with your access and runs on your desktop.",
    error,
    errorDescription: "We couldn’t update your agents here. Try again.",
    onClose,
    onRestoreFocus,
  };
  if (!loading && agents.length === 0)
    return (
      <ConfirmDialog {...common} confirmLabel="Open Agents" onConfirm={onOpenAgents}>
        <p className="text-sm text-muted-foreground">
          You don’t have an agent yet. Create one in Agents, then come back to add it here.
        </p>
      </ConfirmDialog>
    );
  return (
    <>
      <ConfirmDialog {...common}>
        {loading && <LoadingState label="Loading your agents" variant="compact" />}
        {!loading && (
          <ul ref={list} tabIndex={-1} aria-label="Your agents" className="-mx-2 grid gap-0.5">
            {agents.map((agent) => (
              <li
                key={agent.agentId}
                className={cn(actionRow, "flex h-10 items-center gap-2 rounded-md px-2")}
              >
                <PersonAvatar name={agent.name} image={agent.image} agent />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{agent.name}</span>
                {agent.actorId && (
                  <span className="text-xs text-muted-foreground">In this conversation</span>
                )}
                {agent.actorId && busyId === agent.agentId && (
                  <Spinner aria-label={`Removing ${agent.name}`} className="size-4" />
                )}
                {agent.actorId && busyId !== agent.agentId && (
                  <RowActions label={`Actions for ${agent.name}`}>
                    <RowAction
                      label={`Remove ${agent.name}`}
                      destructive
                      disabled={!!busyId}
                      onClick={() => removal.open(agent)}
                    >
                      <UserMinus />
                    </RowAction>
                  </RowActions>
                )}
                {!agent.actorId && (
                  <PendingButton
                    size="sm"
                    variant="outline"
                    disabled={!!busyId}
                    pending={busyId === agent.agentId}
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
      {removing?.actorId && (
        <ConfirmDialog
          title={`Remove ${removing.name} from ${name}?`}
          description={`${removing.name} stops reading and replying here. Its earlier messages stay, and you can add it back later.`}
          confirmLabel={`Remove ${removing.name}`}
          destructive
          onClose={removal.close}
          onRestoreFocus={removal.restoreFocus}
          onConfirm={() => {
            onRemove(removing.actorId!);
            removal.close();
          }}
        />
      )}
    </>
  );
}

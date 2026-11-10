import { useRef, useState } from "react";

import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { PendingButton } from "@/components/feedback/pending-button";
import { RowAction, RowActions } from "@/components/layout/row-actions";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Spinner } from "@/components/ui/spinner";
import { UserMinus } from "lucide-react";

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
  const [removing, setRemoving] = useState<ConversationAgentOption>();
  // The confirmation is mounted by state, so it has no trigger of its own. Return to the row
  // button. It is replaced by a spinner while the agent is removed, so then the list is the
  // nearest place left.
  const list = useRef<HTMLUListElement>(null);
  const launcher = useRef<HTMLElement | null>(null);
  const restoreRowFocus = () => {
    if (launcher.current?.isConnected) launcher.current.focus();
    else {
      const target = list.current?.querySelector<HTMLElement>("button:not(:disabled)");
      (target ?? list.current?.closest<HTMLElement>('[role="dialog"]'))?.focus();
    }
  };
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
    <>
      <ConfirmDialog {...common}>
        {loading && <Spinner aria-label="Loading your agents" className="mx-auto" />}
        {!loading && (
          <ul ref={list} aria-label="Your agents" className="-mx-2 grid gap-0.5">
            {agents.map((agent) => (
              <li
                key={agent.agentId}
                className="group/row flex h-10 items-center gap-2 rounded-md px-2"
              >
                <PersonAvatar name={agent.name} agent />
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
                      onClick={() => {
                        launcher.current =
                          document.activeElement instanceof HTMLElement
                            ? document.activeElement
                            : null;
                        setRemoving(agent);
                      }}
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
      {removing?.actorId && (
        <ConfirmDialog
          title={`Remove ${removing.name} from ${name}?`}
          description={`${removing.name} stops reading and replying here. Its earlier messages stay, and you can add it back later.`}
          confirmLabel={`Remove ${removing.name}`}
          pendingLabel="Removing…"
          destructive
          onClose={() => setRemoving(undefined)}
          onRestoreFocus={restoreRowFocus}
          onConfirm={() => {
            onRemove(removing.actorId!);
            setRemoving(undefined);
          }}
        />
      )}
    </>
  );
}

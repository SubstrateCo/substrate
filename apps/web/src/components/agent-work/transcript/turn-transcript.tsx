import type { AgentRequestView, AgentTurnView } from "@substrate/contracts/agent-work";
import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { RecordName } from "../requests/proposal-preview";
import { RequestCard } from "../requests/request-card";
import { TurnTimeline } from "./turn-timeline";
import { TurnTranscriptView } from "./turn-transcript-view";
import { useStopTurn } from "@/components/agent-work/use-stop-turn";
import { useWorkspaceScope } from "@/components/workspace/workspace-scope-context";
import { useNow } from "@/hooks/use-now";
import { outputLink } from "@/lib/agent-work/links";
import { isOpenRequest } from "@/lib/agent-work/requests";
import { sessionKindLabels, turnLabel, turnTone } from "@/lib/agent-work/status";
import { transcriptEntries } from "@/lib/agent-work/transcript";
import { usageLabel } from "@/lib/agent-work/usage";
import { messageLink } from "@/lib/navigation/record-links";
import { turnEventsOptions } from "@/queries/agent-work/local";
import { conversationsQueryOptions } from "@/queries/messaging/options";

function transcriptDetails(
  turn: AgentTurnView | undefined,
  now: ReturnType<typeof useNow>,
  requests: readonly AgentRequestView[],
  organizationId: string,
  canOpenConversation: (conversationId: string) => boolean,
) {
  if (!turn) return {};
  const openRequest = requests.find((entry) => entry.turnId === turn.id && isOpenRequest(entry));
  const sources = turn.sourceMessages.map((source) => (
    <RecordName
      key={source.messageId}
      kind="conversation"
      record={
        canOpenConversation(source.conversationId)
          ? {
              access: "visible",
              label: "The message",
              link: messageLink(organizationId, source.conversationId, source.messageId),
            }
          : { access: "hidden" }
      }
    />
  ));
  const outputs = turn.outputs.flatMap((entry) => {
    if (entry.kind !== "message") return [];
    return [
      <RecordName
        key={entry.id}
        kind="conversation"
        record={
          canOpenConversation(entry.conversationId)
            ? { access: "visible", label: "The reply", link: outputLink(organizationId, entry) }
            : { access: "hidden" }
        }
      />,
    ];
  });
  return {
    tone: turnTone(turn, openRequest),
    label: turnLabel(turn, now, openRequest),
    startedAt: turn.startedAt ?? turn.createdAt,
    session: sessionKindLabels[turn.sessionKind],
    usage: usageLabel(turn.usage),
    diagnostic: turn.error?.trim() || undefined,
    sources: sources.length ? sources : undefined,
    outputs: outputs.length ? outputs : undefined,
  };
}

/**
 * One turn's transcript from the home desktop, with its sources and outputs. Links check the
 * viewer's conversations now; a conversation the viewer can no longer open shows a placeholder.
 */
export function TurnTranscript({
  turn,
  turnLoading,
  turnError,
  onRetryTurn,
  agentName,
  requests,
  unavailable,
  onClose,
}: {
  turn?: AgentTurnView;
  turnLoading: boolean;
  turnError: Error | null;
  onRetryTurn: () => void;
  agentName: string;
  requests: readonly AgentRequestView[];
  unavailable?: string;
  onClose: () => void;
}) {
  const { userId, organizationId } = useWorkspaceScope();
  const live = !!turn && liveTurnStatuses.includes(turn.status);
  const events = useQuery({
    ...turnEventsOptions(userId, organizationId, turn?.id),
    enabled: !unavailable,
  });
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const { onStop, stopping } = useStopTurn(userId, organizationId, turn);
  const now = useNow(live);
  const canOpenConversation = (conversationId: string) =>
    conversations.data?.some((conversation) => conversation.id === conversationId) ?? false;
  const request = (id: string) => requests.find((entry) => entry.id === id);
  return (
    <TurnTranscriptView
      name={agentName}
      {...transcriptDetails(turn, now, requests, organizationId, canOpenConversation)}
      unavailable={unavailable}
      loading={turnLoading || events.isPending}
      error={turnError ?? events.error}
      onRetry={() => {
        onRetryTurn();
        // Without a turn the events read is skipped; the turn's own retry loads it first.
        if (turn) void events.refetch();
      }}
      onClose={onClose}
      timeline={
        turn &&
        events.data && (
          <TurnTimeline
            entries={transcriptEntries(events.data, live)}
            outputLink={({ output }) =>
              output.kind === "message" && canOpenConversation(output.conversationId)
                ? outputLink(organizationId, output)
                : undefined
            }
            renderRequest={(requestId) => {
              const found = request(requestId);
              return found && <RequestCard request={found} />;
            }}
          />
        )
      }
      onStop={onStop}
      stopping={stopping}
    />
  );
}

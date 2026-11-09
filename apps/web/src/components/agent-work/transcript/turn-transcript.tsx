import type { AgentRequestView, AgentTurnView } from "@startup-os/contracts/agent-work";
import { liveTurnStatuses } from "@startup-os/contracts/agent-work";

import { useQuery } from "@tanstack/react-query";

import { RequestCard } from "../requests/request-card";
import { RequestResult } from "../requests/request-card-view";
import { RecordLink } from "./record-link";
import { TurnTimeline } from "./turn-timeline";
import { TurnTranscriptView } from "./turn-transcript-view";
import { actionErrorMessage } from "@/components/feedback/action-error-message";
import { useNow } from "@/hooks/use-now";
import { outputLink, proposalResultLink } from "@/lib/agent-work/links";
import { isOpenRequest } from "@/lib/agent-work/requests";
import { turnStatus } from "@/lib/agent-work/status";
import { transcriptEntries } from "@/lib/agent-work/transcript";
import { usageLabel } from "@/lib/agent-work/usage";
import { messageHref } from "@/lib/navigation/record-links";
import { turnEventsOptions } from "@/queries/agent-work/local";
import { useLocalWorkActions } from "@/queries/agent-work/mutations";
import { conversationsQueryOptions } from "@/queries/messaging/options";
import { toast } from "sonner";

const sessionLabels = {
  dm: "Direct message",
  thread: "Thread",
  routine: "Routine",
  helper: "Helper",
};

/**
 * One turn's transcript from the home desktop, with its sources and outputs. Links check the
 * viewer's conversations now; a conversation the viewer can no longer open shows a placeholder.
 */
export function TurnTranscript({
  userId,
  organizationId,
  turn,
  turnLoading,
  turnError,
  onRetryTurn,
  agentName,
  requests,
  unavailable,
  onClose,
}: {
  userId: string;
  organizationId: string;
  turn?: AgentTurnView;
  turnLoading: boolean;
  turnError: Error | null;
  onRetryTurn: () => void;
  agentName: string;
  requests: readonly AgentRequestView[];
  unavailable?: string;
  onClose: () => void;
}) {
  const live = !!turn && liveTurnStatuses.includes(turn.status);
  const events = useQuery({
    ...turnEventsOptions(userId, organizationId, turn?.id ?? ""),
    enabled: !!turn && !unavailable,
  });
  const conversations = useQuery(conversationsQueryOptions(organizationId));
  const { stop } = useLocalWorkActions(userId, organizationId);
  const now = useNow(live);
  const open = (conversationId: string) =>
    conversations.data?.some((conversation) => conversation.id === conversationId) ?? false;
  const request = (id: string) => requests.find((entry) => entry.id === id);
  const status =
    turn &&
    turnStatus(
      turn,
      now,
      requests.find((entry) => entry.turnId === turn.id && isOpenRequest(entry)),
    );
  const sources = turn?.sourceMessages.map((source) => (
    <RecordLink
      key={source.messageId}
      label="The message"
      href={
        open(source.conversationId)
          ? messageHref(organizationId, source.conversationId, source.messageId)
          : undefined
      }
    />
  ));
  const outputs = turn?.outputs.flatMap((entry) => {
    if (entry.kind !== "message") return [];
    const href = open(entry.conversationId) ? outputLink(organizationId, entry) : undefined;
    return [<RecordLink key={entry.id} label="The reply" href={href} />];
  });
  return (
    <TurnTranscriptView
      name={agentName}
      tone={status?.tone}
      label={status?.label}
      startedAt={turn?.startedAt ?? turn?.createdAt}
      session={turn && sessionLabels[turn.sessionKind]}
      usage={turn && usageLabel(turn.usage)}
      sources={sources?.length ? sources : undefined}
      outputs={outputs?.length ? outputs : undefined}
      unavailable={unavailable}
      loading={turnLoading || events.isPending}
      error={turnError ?? events.error}
      onRetry={() => {
        onRetryTurn();
        void events.refetch();
      }}
      onClose={onClose}
      timeline={
        turn &&
        events.data && (
          <TurnTimeline
            entries={transcriptEntries(events.data, live)}
            outputHref={({ output }) =>
              output.kind === "message" && open(output.conversationId)
                ? outputLink(organizationId, output)
                : undefined
            }
            renderRequest={(requestId) => {
              const found = request(requestId);
              if (!found) return null;
              return isOpenRequest(found) ? (
                <RequestCard userId={userId} organizationId={organizationId} request={found} />
              ) : (
                <RequestResult request={found} link={proposalResultLink(organizationId, found)} />
              );
            }}
          />
        )
      }
      onStop={
        live && turn.status !== "stopping"
          ? () =>
              stop.mutate(turn.id, {
                onError: (error) =>
                  toast.error(actionErrorMessage(error, "We couldn’t stop this work.")),
              })
          : undefined
      }
      stopping={stop.isPending || turn?.status === "stopping"}
    />
  );
}

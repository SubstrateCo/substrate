import type { AgentRequestView } from "@substrate/contracts/agent-work";
import type { RecordLabel } from "@substrate/contracts/context/input";

import { useQueries, useQuery } from "@tanstack/react-query";

import {
  proposalDetailTask,
  proposalRecordIds,
  proposalTarget,
  type ProposalLookups,
  type ProposalTarget,
} from "@/lib/agent-work/proposal-target";
import { recordLabelsOptions } from "@/queries/context/links";
import { projectQueryOptions } from "@/queries/tasks/options";

/** The label read takes at most this many IDs. */
const labelBatch = 50;

/**
 * The records a proposal names, resolved through the viewer's own reads. The server returns
 * labels only for records the viewer can open, so any other ID resolves as hidden.
 */
export function useProposalTarget(
  organizationId: string,
  request: AgentRequestView,
  { enabled = true, crmEnabled }: { enabled?: boolean; crmEnabled: boolean },
): ProposalTarget | null {
  const action = enabled ? request.proposal?.action : undefined;
  const ids = action ? proposalRecordIds(action) : [];
  const batches = Array.from({ length: Math.ceil(ids.length / labelBatch) }, (_, index) =>
    ids.slice(index * labelBatch, (index + 1) * labelBatch),
  );
  const reads = useQueries({
    queries: batches.map((batch) => recordLabelsOptions(organizationId, batch)),
  });
  const labels = new Map<string, RecordLabel>(
    reads.flatMap((read) => (read.data ?? []).map((label) => [label.id, label] as const)),
  );
  const pending = reads.some((read) => read.isPending);
  const failed = reads.some((read) => read.isError);

  // A task change also names the task's project and parent, which its project's detail holds.
  const taskId = action && proposalDetailTask(action);
  const taskLabel = taskId ? labels.get(taskId) : undefined;
  const projectId = taskLabel?.type === "task" ? (taskLabel.projectId ?? undefined) : undefined;
  const detail = useQuery(projectQueryOptions(organizationId, projectId));
  if (!action) return null;

  const lookups: ProposalLookups = {
    organizationId,
    crmEnabled,
    label: (id) => {
      const label = labels.get(id);
      if (label) return label;
      // A failed read names nothing, so its records stay hidden and approval stays blocked.
      return pending && !failed ? undefined : null;
    },
    project: (id) => {
      if (id !== projectId) return null;
      if (detail.isPending) return undefined;
      return detail.error ? null : detail.data;
    },
  };
  return proposalTarget(action, lookups);
}

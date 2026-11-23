import { Link } from "@tanstack/react-router";

import { dealAmount } from "../crm-types";
import { ContentNotice } from "@/components/feedback/content-notice";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { Board, BoardCard, BoardColumn, boardCardTarget } from "@/components/layout/board";
import { Button } from "@/components/ui/button";
import { crmLink } from "@/lib/navigation/record-links";
import { cn } from "cn";
import { Handshake, Plus } from "lucide-react";

export type PipelineDeal = {
  entityId: string;
  title: string;
  stageId: string;
  outcome: string;
  amount: string | null;
  currency: string | null;
};

export function DealPipeline({
  organizationId,
  stages,
  deals,
  onCreate,
}: {
  organizationId: string;
  stages: { id: string; name: string }[];
  deals: PipelineDeal[];
  /** Offers the empty board's primary action when the viewer can create a deal. */
  onCreate?: () => void;
}) {
  if (deals.length === 0)
    return (
      <ContentNotice
        icon={Handshake}
        title="No open deals"
        description="Create a deal to track a customer pursuit through your pipeline."
        action={
          onCreate && (
            <Button onClick={onCreate}>
              <Plus aria-hidden />
              New deal
            </Button>
          )
        }
      />
    );
  return (
    <Board aria-label="Deals pipeline">
      {stages.map((stage) => {
        const rows = deals.filter((deal) => deal.stageId === stage.id && deal.outcome === "open");
        return (
          <BoardColumn
            key={stage.id}
            label={stage.name}
            listLabel={`${stage.name} deals`}
            count={rows.length}
            empty={rows.length ? undefined : "No deals in this stage"}
          >
            {rows.map((deal) => (
              <BoardCard key={deal.entityId}>
                <Link
                  {...crmLink(organizationId, "deals", deal.entityId)}
                  className={cn(boardCardTarget, "block")}
                >
                  {deal.title}
                </Link>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {dealAmount(deal.amount, deal.currency)}
                </span>
              </BoardCard>
            ))}
          </BoardColumn>
        );
      })}
    </Board>
  );
}

export function DealPipelineLoading() {
  return (
    <div role="status" aria-label="Loading deals" className="flex min-h-0 flex-1">
      <Board aria-hidden="true">
        {[0, 1, 2].map((key) => (
          <BoardColumn
            key={key}
            label={<SkeletonText width="6rem" />}
            listLabel=""
            count={<SkeletonText width="1rem" />}
          >
            <BoardCard>
              <SkeletonText width="9rem" />
              <SkeletonText width="5rem" className="text-xs" />
            </BoardCard>
          </BoardColumn>
        ))}
      </Board>
    </div>
  );
}

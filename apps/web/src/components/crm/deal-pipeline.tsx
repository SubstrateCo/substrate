import { Link } from "@tanstack/react-router";

import { dealAmount } from "./crm-types";
import { ContentNotice } from "@/components/feedback/content-notice";
import { crmLink } from "@/lib/navigation/record-links";
import { Handshake } from "lucide-react";

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
}: {
  organizationId: string;
  stages: { id: string; name: string }[];
  deals: PipelineDeal[];
}) {
  if (deals.length === 0)
    return (
      <ContentNotice
        icon={Handshake}
        title="No open deals"
        description="Create a deal to track a customer pursuit through your pipeline."
      />
    );
  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-4" aria-label="Deals pipeline">
      {stages.map((stage) => {
        const rows = deals.filter((deal) => deal.stageId === stage.id && deal.outcome === "open");
        return (
          <section
            key={stage.id}
            className="flex w-64 shrink-0 flex-col gap-3 rounded-lg bg-muted/30 p-3"
            aria-label={stage.name}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{stage.name}</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{rows.length}</span>
            </div>
            <ul className="space-y-2">
              {rows.map((deal) => (
                <li key={deal.entityId}>
                  <Link
                    {...crmLink(organizationId, "deals", deal.entityId)}
                    className="block space-y-3 rounded-lg border bg-surface p-3 shadow-surface transition-colors hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="block text-sm font-medium wrap-break-word">{deal.title}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {dealAmount(deal.amount, deal.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {rows.length === 0 && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No deals in this stage
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

import { Link } from "@tanstack/react-router";

import { dealAmount } from "./crm-types";
import { ContentNotice } from "@/components/feedback/content-notice";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { crmLink } from "@/lib/navigation/record-links";
import { Handshake } from "lucide-react";
import { Slot } from "radix-ui";

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
          <PipelineColumn key={stage.id} aria-label={stage.name}>
            <PipelineHeading name={stage.name} count={rows.length} />
            <ul className="space-y-2">
              {rows.map((deal) => (
                <li key={deal.entityId}>
                  <PipelineCard asChild>
                    <Link
                      {...crmLink(organizationId, "deals", deal.entityId)}
                      className="transition-colors hover:bg-row-hover focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <PipelineCardContent
                        title={deal.title}
                        amount={dealAmount(deal.amount, deal.currency)}
                      />
                    </Link>
                  </PipelineCard>
                </li>
              ))}
            </ul>
            {rows.length === 0 && <ContentNotice variant="inline" title="No deals in this stage" />}
          </PipelineColumn>
        );
      })}
    </div>
  );
}

function PipelineHeading({ name, count }: { name: React.ReactNode; count: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium">{name}</h2>
      <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
}

function PipelineCard({
  children,
  asChild = false,
}: {
  children: React.ReactNode;
  asChild?: boolean;
}) {
  const Component = asChild ? Slot.Root : "div";
  return (
    <Component className="block space-y-3 rounded-lg border bg-surface p-3 shadow-surface">
      {children}
    </Component>
  );
}

function PipelineCardContent({
  title,
  amount,
}: {
  title: React.ReactNode;
  amount: React.ReactNode;
}) {
  return (
    <>
      <span className="block text-sm font-medium wrap-break-word">{title}</span>
      <span className="block text-xs text-muted-foreground tabular-nums">{amount}</span>
    </>
  );
}

function PipelineColumn({
  children,
  ...props
}: {
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  return (
    <section className="flex w-64 shrink-0 flex-col gap-3 rounded-lg bg-muted/30 p-3" {...props}>
      {children}
    </section>
  );
}

export function DealPipelineLoading() {
  return (
    <div role="status" aria-label="Loading deals">
      <div aria-hidden="true" className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-4">
        {[0, 1, 2].map((key) => (
          <PipelineColumn key={key}>
            <PipelineHeading
              name={<SkeletonText width="6rem" />}
              count={<SkeletonText width="1rem" />}
            />
            <ul className="space-y-2">
              <li>
                <PipelineCard>
                  <PipelineCardContent
                    title={<SkeletonText width="9rem" />}
                    amount={<SkeletonText width="5rem" />}
                  />
                </PipelineCard>
              </li>
            </ul>
          </PipelineColumn>
        ))}
      </div>
    </div>
  );
}

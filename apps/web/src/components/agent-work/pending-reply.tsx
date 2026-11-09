import type { ReactNode } from "react";

import { WorkIndicator } from "./work-indicator";
import type { WorkTone } from "@/lib/agent-work/status";
import { Bot } from "lucide-react";

/**
 * Stands in for the agent's reply until it posts one. Only the agent's owner sees agent work,
 * so this row says so; everyone else sees the reply when it arrives.
 */
export function PendingReply({
  name,
  tone,
  label,
  children,
}: {
  name: string;
  tone: WorkTone;
  label: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={`${name} reply`} className="mt-2 flex max-w-180 min-w-0 gap-2.5">
      <span className="relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
        <Bot aria-hidden="true" className="size-3.5" />
        <WorkIndicator tone={tone} label={label} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">{name}</span>
          <span className="text-xs text-muted-foreground">Only visible to you</span>
        </p>
        {children}
      </div>
    </section>
  );
}

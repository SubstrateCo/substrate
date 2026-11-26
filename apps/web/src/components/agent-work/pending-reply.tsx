import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LockKeyhole } from "lucide-react";

/**
 * Stands in for the agent's reply until it posts one. Only the agent's owner sees agent work,
 * everyone else sees only the reply when it arrives.
 */
export function PendingReply({
  name,
  status,
  children,
}: {
  name: string;
  /** The work's status, beside the name. */
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={`${name} reply`} className="mt-1 flex max-w-180 min-w-0 gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {status}
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} aria-label="Only visible to you" className="text-muted-foreground">
                <LockKeyhole aria-hidden="true" className="size-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent>Only visible to you</TooltipContent>
          </Tooltip>
        </div>
        {children}
      </div>
    </section>
  );
}

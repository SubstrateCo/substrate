import type { AgentRequestPayload } from "@substrate/contracts/agent-work";

import { PendingButton } from "@/components/feedback/pending-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

type Approval = Extract<AgentRequestPayload, { type: "approval" }>;

export function ApprovalRequest({
  payload,
  pendingOptionId,
  onRespond,
}: {
  payload: Approval;
  /** The option being sent, if any. Every choice waits while one is sent. */
  pendingOptionId?: string;
  onRespond: (optionId: string) => void;
}) {
  const pending = pendingOptionId !== undefined;
  // Approve and decline stay visible. Other choices, such as "Always allow", go in a menu.
  const styled = [
    ...payload.options.filter((option) => option.style === "approve"),
    ...payload.options.filter((option) => option.style === "deny"),
  ];
  const primary = styled.length ? styled : payload.options.slice(0, 2);
  const more = payload.options.filter((option) => !primary.includes(option));
  const sendingMore = more.find((option) => option.id === pendingOptionId);
  // The card around this shows the title.
  return (
    <div className="grid gap-2.5">
      {payload.detail && (
        <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-xs wrap-anywhere whitespace-pre-wrap">
          {payload.detail}
        </pre>
      )}
      <div className="flex flex-wrap gap-2">
        {primary.map((option) => (
          <PendingButton
            key={option.id}
            type="button"
            size="sm"
            variant={option.style === "approve" ? "default" : "outline"}
            disabled={pending}
            pending={option.id === pendingOptionId}
            pendingLabel="Sending…"
            onClick={() => onRespond(option.id)}
          >
            {option.label}
          </PendingButton>
        ))}
        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <PendingButton
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                pending={!!sendingMore}
                pendingLabel={`Sending ${sendingMore?.label ?? ""}…`}
              >
                More
                <ChevronDown aria-hidden="true" />
              </PendingButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {more.map((option) => (
                <DropdownMenuItem key={option.id} onSelect={() => onRespond(option.id)}>
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

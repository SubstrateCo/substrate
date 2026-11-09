import type { AgentRunRequestPayload } from "@startup-os/contracts/agent-runs";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

type Approval = Extract<AgentRunRequestPayload, { type: "approval" }>;

export function ApprovalRequest({
  payload,
  pending,
  onRespond,
}: {
  payload: Approval;
  pending: boolean;
  onRespond: (optionId: string) => void;
}) {
  // Approve and decline stay visible. Other choices, such as "Always allow", go in a menu.
  const styled = [
    ...payload.options.filter((option) => option.style === "approve"),
    ...payload.options.filter((option) => option.style === "deny"),
  ];
  const primary = styled.length ? styled : payload.options.slice(0, 2);
  const more = payload.options.filter((option) => !primary.includes(option));
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
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={option.style === "approve" ? "default" : "outline"}
            disabled={pending}
            onClick={() => onRespond(option.id)}
          >
            {option.label}
          </Button>
        ))}
        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="ghost" disabled={pending}>
                More
                <ChevronDown aria-hidden="true" />
              </Button>
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

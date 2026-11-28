import type { AgentRequestPayload } from "@substrate/contracts/agent-work";

import { PendingButton } from "@/components/feedback/pending-button";
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block";
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
  pendingOptionId?: string;
  onRespond: (optionId: string) => void;
}) {
  const pending = pendingOptionId !== undefined;
  const styled = [
    ...payload.options.filter((option) => option.style === "approve"),
    ...payload.options.filter((option) => option.style === "deny"),
  ];
  const primary = styled.length ? styled : payload.options.slice(0, 2);
  const more = styled.length
    ? payload.options.filter((option) => option.style === "neutral")
    : payload.options.slice(2);
  const sendingMore = more.find((option) => option.id === pendingOptionId);
  return (
    <div className="grid gap-2.5">
      {payload.detail && (
        <CodeBlock size="sm">
          <CodeBlockContent wrap className="max-h-48">
            {payload.detail}
          </CodeBlockContent>
        </CodeBlock>
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
              >
                More
                <ChevronDown aria-hidden="true" data-icon="inline-end" />
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

import type { ReactNode } from "react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Heading } from "@/components/ui/heading";
import { cn } from "cn";
import { Inbox, type LucideIcon } from "lucide-react";

export function ContentNotice({
  title,
  description,
  icon: Icon = Inbox,
  action,
  variant = "pane",
  tone = "default",
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  variant?: "pane" | "compact" | "inline";
  tone?: "default" | "error";
}) {
  const role = tone === "error" ? "alert" : "status";
  const media = tone === "error" ? "error" : "icon";
  if (variant === "inline")
    return (
      <div
        role={role}
        className={cn(
          "flex flex-wrap items-center gap-x-2 text-sm",
          tone === "error" ? "text-destructive" : "text-muted-foreground",
        )}
      >
        <span>{title}</span>
        {action}
      </div>
    );
  if (variant === "compact")
    return (
      <div role={role} className="flex items-start gap-3">
        <EmptyMedia variant={media}>
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <EmptyTitle>
              <Heading level={2} variant="inherit">
                {title}
              </Heading>
            </EmptyTitle>
            {description && (
              <EmptyDescription className="wrap-break-word">{description}</EmptyDescription>
            )}
          </div>
          {action && <EmptyContent className="items-start">{action}</EmptyContent>}
        </div>
      </div>
    );
  return (
    <Empty role={role} variant="pane">
      <EmptyHeader>
        <EmptyMedia variant={media}>
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>
          <Heading level={2} variant="inherit">
            {title}
          </Heading>
        </EmptyTitle>
        {description && (
          <EmptyDescription className="wrap-break-word">{description}</EmptyDescription>
        )}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

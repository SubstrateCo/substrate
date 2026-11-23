import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { LucideIcon } from "lucide-react";

/**
 * A banner above content that says what state it is in and offers the one action that changes
 * it: reconnect a calendar, restore a project, join a channel. `warning` asks for attention and
 * is announced as an alert; `neutral` is a status. An action's failure shows under the text.
 */
export function InlineNotice({
  icon: Icon,
  tone = "neutral",
  action,
  error,
  className,
  children,
}: {
  icon: LucideIcon;
  tone?: "neutral" | "warning";
  action?: ReactNode;
  /** Reviewed copy for a failed action. */
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Alert
      role={tone === "warning" ? "alert" : "status"}
      presentation="inline"
      className={className}
    >
      <Icon
        aria-hidden="true"
        className={tone === "warning" ? "text-warning" : "text-muted-foreground"}
      />
      <AlertDescription>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
            <span className="text-foreground">{children}</span>
            {error && (
              <span role="alert" className="text-destructive">
                {error}
              </span>
            )}
          </div>
          {action}
        </div>
      </AlertDescription>
    </Alert>
  );
}

import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import type { LucideIcon } from "lucide-react";

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

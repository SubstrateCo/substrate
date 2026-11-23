import type { ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { TriangleAlert } from "lucide-react";

/** A calendar that needs access again: what happened, and the one action that fixes it. */
export function ReconnectNotice({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <Alert presentation="inline">
      <TriangleAlert aria-hidden="true" className="text-warning" />
      <AlertDescription>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 basis-56 text-foreground">{children}</p>
          {action}
        </div>
      </AlertDescription>
    </Alert>
  );
}

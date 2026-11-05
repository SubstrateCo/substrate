import { Alert, AlertDescription } from "../primitives/alert";
import { useState } from "react";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { Button } from "../primitives/button";

export function FormMessage({
  error,
  message,
  floating = false,
  reserve = false,
}: {
  error?: Error | null;
  message?: string;
  floating?: boolean;
  reserve?: boolean;
}) {
  const [dismissed, setDismissed] = useState<Error | string | null>(null);
  if (!error && !message) return reserve ? <div aria-hidden="true" className="min-h-20" /> : null;
  if (floating && dismissed === (error || message)) return null;
  const Icon = error ? CircleAlert : CircleCheck;
  const feedback = (
    <Alert
      variant={error ? "destructive" : "success"}
      presentation={floating ? "floating" : "inline"}
      role={error ? "alert" : "status"}
      data-action-notice={floating || undefined}
      className={
        floating
          ? "fixed inset-x-4 top-4 z-50 ml-auto max-h-[50dvh] w-auto max-w-sm overflow-y-auto"
          : undefined
      }
    >
      <Icon className={error ? "text-destructive" : "text-success"} />
      <AlertDescription className="min-w-0 wrap-break-word">
        {error?.message || message}
      </AlertDescription>
      {floating && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss notification"
          className="absolute right-3 top-3"
          onClick={() => setDismissed(error || message || null)}
        >
          <X />
        </Button>
      )}
    </Alert>
  );
  return reserve ? <div className="min-h-20">{feedback}</div> : feedback;
}

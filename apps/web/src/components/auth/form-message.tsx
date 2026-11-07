import { useState } from "react";

import { actionErrorMessage } from "../feedback/action-error-message";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CircleAlert, CircleCheck, X } from "lucide-react";

export function FormMessage({
  error,
  message,
  floating = false,
  floatingPlacement = "top",
  onDismiss,
  reserve = false,
  errorDescription,
}: {
  error?: Error | null;
  message?: string;
  floating?: boolean;
  floatingPlacement?: "top" | "below-header" | "workspace";
  onDismiss?: () => void;
  reserve?: boolean;
  errorDescription?: string;
}) {
  const [dismissed, setDismissed] = useState<Error | string | null>(null);
  if (!error && !message) return reserve ? <div aria-hidden="true" className="min-h-20" /> : null;
  if (floating && dismissed === (error || message)) return null;
  function dismiss() {
    setDismissed(error || message || null);
    onDismiss?.();
  }
  const floatingPosition = {
    top: "top-4 w-auto",
    "below-header": "top-20 w-auto",
    workspace: "top-28 md:top-22",
  }[floatingPlacement];
  const Icon = error ? CircleAlert : CircleCheck;
  const feedback = (
    <Alert
      variant={error ? "destructive" : "success"}
      presentation={floating ? "floating" : "inline"}
      role={error ? "alert" : "status"}
      data-action-notice={floating || undefined}
      onKeyDown={(event) => {
        if (floating && onDismiss && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
      className={
        floating
          ? `fixed inset-x-4 ${floatingPosition} z-50 ml-auto max-h-[50dvh] max-w-sm overflow-y-auto`
          : undefined
      }
      style={
        floating && floatingPlacement === "workspace"
          ? { width: "min(24rem, calc(100vw - 5.5rem))" }
          : undefined
      }
    >
      <Icon className={error ? "text-destructive" : "text-success"} />
      <AlertDescription className="min-w-0 wrap-break-word">
        {error ? actionErrorMessage(error, errorDescription) : message}
      </AlertDescription>
      {floating && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Dismiss notification"
          className="absolute top-3 right-3"
          onClick={dismiss}
        >
          <X />
        </Button>
      )}
    </Alert>
  );
  return reserve ? <div className="min-h-20">{feedback}</div> : feedback;
}

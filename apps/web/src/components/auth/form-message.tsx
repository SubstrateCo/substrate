import { actionErrorMessage } from "../feedback/action-error-message";
import { Alert, AlertDescription } from "../ui/alert";
import { CircleAlert, CircleCheck } from "lucide-react";

export function FormMessage({
  error,
  message,
  reserve = false,
  errorDescription,
}: {
  error?: Error | null;
  message?: string;
  reserve?: boolean;
  errorDescription?: string;
}) {
  if (!error && !message) return reserve ? <div aria-hidden="true" className="min-h-20" /> : null;
  const Icon = error ? CircleAlert : CircleCheck;
  const feedback = (
    <Alert
      variant={error ? "destructive" : "success"}
      presentation="inline"
      role={error ? "alert" : "status"}
    >
      <Icon className={error ? "text-destructive" : "text-success"} />
      <AlertDescription className="min-w-0 wrap-break-word">
        {error ? actionErrorMessage(error, errorDescription) : message}
      </AlertDescription>
    </Alert>
  );
  return reserve ? <div className="min-h-20">{feedback}</div> : feedback;
}

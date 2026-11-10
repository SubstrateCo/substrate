import { actionErrorMessage } from "../feedback/action-error-message";
import { Alert, AlertDescription } from "../ui/alert";
import { CircleAlert, CircleCheck } from "lucide-react";

export function FormMessage({
  error,
  message,
  errorDescription,
}: {
  error?: Error | null;
  message?: string;
  errorDescription?: string;
}) {
  if (!error && !message) return null;
  const Icon = error ? CircleAlert : CircleCheck;
  return (
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
}

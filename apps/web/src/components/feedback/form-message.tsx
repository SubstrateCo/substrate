import { Alert, AlertDescription } from "../ui/alert";
import { actionErrorMessage } from "./action-error-message";
import { CircleAlert, CircleCheck } from "lucide-react";

export function FormMessage({
  error,
  message,
  errorDescription,
}: {
  error?: Error | string | null;
  message?: string;
  errorDescription?: string;
}) {
  if (!error && !message) return null;
  const Icon = error ? CircleAlert : CircleCheck;
  const content =
    error instanceof Error ? actionErrorMessage(error, errorDescription) : error || message;
  return (
    <Alert
      variant={error ? "destructive" : "success"}
      presentation="inline"
      role={error ? "alert" : "status"}
    >
      <Icon className={error ? "text-destructive" : "text-success"} />
      <AlertDescription className="min-w-0 wrap-break-word">{content}</AlertDescription>
    </Alert>
  );
}

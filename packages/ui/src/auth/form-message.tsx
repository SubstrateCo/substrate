import { Alert, AlertDescription } from "../primitives/alert";

export function FormMessage({ error, message }: { error?: Error | null; message?: string }) {
  if (!error && !message) return null;
  return (
    <Alert variant={error ? "destructive" : "default"} role={error ? "alert" : "status"}>
      <AlertDescription>{error?.message || message}</AlertDescription>
    </Alert>
  );
}

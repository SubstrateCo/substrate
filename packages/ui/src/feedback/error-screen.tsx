import { Button } from "../primitives/button";
import { CircleAlert } from "lucide-react";

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-8 shadow-raised">
        <CircleAlert className="size-8 text-destructive" aria-hidden="true" />
        <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          We couldn’t load this page. Please try again.
        </p>
        <Button type="button" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </main>
  );
}

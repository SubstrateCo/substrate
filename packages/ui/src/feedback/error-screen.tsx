import { Button } from "../primitives/button";

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p>Please try again.</p>
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </main>
  );
}

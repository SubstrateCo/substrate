import { Button } from "@/components/ui/button";

export function RetryLink({ onRetry }: { onRetry: () => void }) {
  return (
    <Button type="button" variant="link" size="xs" className="-mx-2" onClick={onRetry}>
      Try again
    </Button>
  );
}

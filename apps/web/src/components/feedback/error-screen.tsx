import { Button } from "../ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { CircleAlert } from "lucide-react";

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Empty role="alert" className="max-w-md">
        <EmptyHeader>
          <EmptyMedia variant="error">
            <CircleAlert aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            <h1 className="text-2xl">Something went wrong</h1>
          </EmptyTitle>
          <EmptyDescription>We couldn’t load this page. Please try again.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}

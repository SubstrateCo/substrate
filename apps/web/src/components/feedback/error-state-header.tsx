import { EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { CircleAlert } from "lucide-react";

export function ErrorStateHeader({ title, description }: { title: string; description: string }) {
  return (
    <EmptyHeader>
      <EmptyMedia variant="error">
        <CircleAlert aria-hidden="true" />
      </EmptyMedia>
      <EmptyTitle>
        <h2>{title}</h2>
      </EmptyTitle>
      <EmptyDescription className="wrap-break-word">{description}</EmptyDescription>
    </EmptyHeader>
  );
}

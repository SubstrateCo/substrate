import { Inbox } from "lucide-react";

export function ContentNotice({ title, description }: { title: string; description: string }) {
  return (
    <div role="status" className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
      <Inbox aria-hidden="true" className="mx-auto mb-3 size-6 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

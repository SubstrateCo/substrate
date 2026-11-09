import { hiddenConversation } from "../requests/proposal-preview";

/** A link to a record, or a placeholder that names nothing when the viewer can't open it. */
export function RecordLink({ href, label }: { href?: string; label: string }) {
  if (!href) return <span className="text-muted-foreground">{hiddenConversation}</span>;
  return (
    <a href={href} className="font-medium text-primary hover:underline">
      {label}
    </a>
  );
}

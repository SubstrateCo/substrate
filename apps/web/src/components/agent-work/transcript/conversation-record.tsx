import { Link } from "@tanstack/react-router";

import { hiddenConversation } from "@/lib/agent-work/hidden-records";
import type { RecordLink } from "@/lib/navigation/record-links";

/**
 * A record in a conversation, as the viewer can see it now. hidden carries no name or link, so
 * it never reveals a conversation the viewer can't open.
 */
export type ConversationRecord =
  | { access: "hidden" }
  | { access: "visible"; label: string; link?: RecordLink };

/** A record in a conversation, as a link when the viewer can open it. */
export function ConversationRecordName({ record }: { record: ConversationRecord }) {
  if (record.access === "hidden")
    return <span className="text-muted-foreground">{hiddenConversation}</span>;
  return record.link ? (
    <Link {...record.link} className="font-medium text-primary hover:underline">
      {record.label}
    </Link>
  ) : (
    <span className="font-medium">{record.label}</span>
  );
}

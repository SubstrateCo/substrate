import type { ConversationVisibility } from "@/lib/messaging/conversations";
import { Bot, Hash, LockKeyhole, MessageCircle, Users, type LucideProps } from "lucide-react";

/**
 * The icon of a conversation's kind: `Hash` for a public channel, `LockKeyhole` for a private one,
 * `MessageCircle` for a DM, `Users` for a group. Beside it the name carries no "#".
 */
export function ConversationKindIcon({
  kind,
  private: locked,
  ...props
}: ConversationVisibility & LucideProps) {
  if (kind === "dm") return <MessageCircle aria-hidden="true" {...props} />;
  if (kind === "agent_dm") return <Bot aria-hidden="true" {...props} />;
  if (kind === "group") return <Users aria-hidden="true" {...props} />;
  return locked ? (
    <LockKeyhole aria-hidden="true" {...props} />
  ) : (
    <Hash aria-hidden="true" {...props} />
  );
}

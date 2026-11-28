import type { ConversationVisibility } from "@/lib/messaging/conversations";
import { Bot, Hash, LockKeyhole, MessageCircle, Users, type LucideProps } from "lucide-react";

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

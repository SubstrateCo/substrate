import type { AgentAvatarCode } from "@substrate/contracts/agents";

import { actorIdentity } from "@/lib/actors/identity";

/** The author's name, or a placeholder when the message has none. */
export function messageAuthorName(message: { authorName?: string | null }) {
  return message.authorName || "Unknown member";
}

/** Who wrote the message. */
export function messageAuthor(message: {
  authorName?: string | null;
  authorType?: "human" | "agent";
  authorImage?: string | null;
  authorAvatar?: AgentAvatarCode | null;
}) {
  return actorIdentity({
    type: message.authorType,
    name: messageAuthorName(message),
    image: message.authorImage,
    avatar: message.authorAvatar,
  });
}

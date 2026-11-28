import type { MessageRow } from "@substrate/contracts/messaging/message-layout";

import type { Message } from "../types";
import { isSameDay, toDate } from "@/lib/format/date";

const groupWindow = 5 * 60_000;

function sameAuthor(a: Message, b: Message) {
  if (a.authorActorEntityId || b.authorActorEntityId)
    return a.authorActorEntityId === b.authorActorEntityId;
  return a.authorName === b.authorName;
}

export function messageRows<T extends Message>(messages: T[]): MessageRow<T>[] {
  return messages.map((message, index) => {
    if (index === 0) return { message, newDay: true, grouped: false };
    const previous = messages[index - 1]!;
    const newDay = !isSameDay(previous.createdAt, message.createdAt);
    const gap =
      (toDate(message.createdAt)?.getTime() ?? 0) - (toDate(previous.createdAt)?.getTime() ?? 0);
    const grouped =
      !newDay &&
      message.authorType !== "agent" &&
      previous.authorType !== "agent" &&
      sameAuthor(previous, message) &&
      gap >= 0 &&
      gap < groupWindow;
    return { message, newDay, grouped };
  });
}

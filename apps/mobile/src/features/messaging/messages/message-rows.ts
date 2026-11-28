import type { MessageRow } from "@substrate/contracts/messaging/message-layout";

const groupWindow = 5 * 60_000;

type GroupedMessage = {
  authorActorEntityId: string | null;
  authorName: string;
  authorType: "human" | "agent";
  createdAt: string | Date;
};

const time = (value: string | Date) => new Date(value).getTime();

function sameDay(a: string | Date, b: string | Date) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function sameAuthor(a: GroupedMessage, b: GroupedMessage) {
  if (a.authorActorEntityId || b.authorActorEntityId)
    return a.authorActorEntityId === b.authorActorEntityId;
  return a.authorName === b.authorName;
}

export function messageRows<T extends GroupedMessage>(messages: readonly T[]): MessageRow<T>[] {
  return messages.map((message, index) => {
    if (index === 0) return { message, newDay: true, grouped: false };
    const previous = messages[index - 1]!;
    const newDay = !sameDay(previous.createdAt, message.createdAt);
    const gap = time(message.createdAt) - time(previous.createdAt);
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

export function timelineFromPages<T extends { id: string }>(pages: readonly (readonly T[])[]) {
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const page of [...pages].reverse())
    for (const message of page) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      ordered.push(message);
    }
  return ordered;
}

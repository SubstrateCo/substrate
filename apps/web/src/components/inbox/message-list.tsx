import {
  conversationKey,
  mailboxName,
  mailFlag,
  type Mailbox,
  type MailColor,
  type MailConversation,
} from "@substrate/contracts/mail";

import { useEffect, useState } from "react";

import { ink, labelName, visibleLabels } from "./mail-colors";
import { MessageLabels } from "./message-labels";
import { Button } from "@/components/ui/button";
import { formatMailListDate, formatFullTimestamp } from "@/lib/format/date";
import { snippetText } from "@/lib/mail/body-text";
import { Star } from "lucide-react";

function MessageRow({
  message,
  mailbox,
  color,
  selected,
  unified,
  allTags,
  today,
  onOpen,
}: {
  message: MailConversation;
  mailbox: Mailbox;
  color: MailColor;
  selected: boolean;
  unified: boolean;
  allTags: boolean;
  today: Date;
  onOpen: (message: MailConversation) => void;
}) {
  const { id, timestamp, flags } = message;
  const sender =
    flags & (mailFlag.sent | mailFlag.drafts)
      ? `To: ${message.to || "No recipient"}`
      : message.from.replace(/\s*<[^>]+>\s*$/, "").replace(/^"(.+)"$/, "$1") ||
        message.from ||
        "Unknown sender";
  const subject = message.subject || "(No subject)",
    stamp = formatMailListDate(timestamp, today);
  const labels = visibleLabels(mailbox, message.labelIds, true).map(labelName);
  const weight = message.hasUnread ? "font-semibold text-foreground" : "font-normal";
  const address = (
    <span title={mailbox.address} className={ink[color]}>
      {mailboxName(mailbox)}
    </span>
  );
  const time = (
    <time dateTime={new Date(timestamp).toISOString()} title={formatFullTimestamp(timestamp)}>
      {stamp}
    </time>
  );
  const label = `${message.hasUnread ? "Unread. " : ""}${sender}: ${subject}. ${message.messageCount} messages. ${mailbox.address}, ${stamp}${labels.length ? `. Labels: ${labels.join(", ")}` : ""}`;
  const props = {
    variant: "sidebar" as const,
    "aria-label": label,
    "aria-current": selected ? ("page" as const) : undefined,
    onClick: () => onOpen(message),
  };
  const titleLine = (
    <span className="relative flex min-w-0 flex-1 items-center gap-1">
      <MessageLabels mailbox={mailbox} ids={message.labelIds} compact all={allTags} />
      <span className="min-w-0 flex-1 truncate">
        {message.hasStar && (
          <Star
            aria-hidden
            className="mr-1 inline size-3 fill-current align-baseline text-primary"
          />
        )}
        <span className={weight}>{subject}</span>
        <span className="ml-2 hidden text-xs font-normal text-muted-foreground @lg:inline">
          {snippetText(message.snippet)}
        </span>
      </span>
    </span>
  );
  const from = (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className={`min-w-0 truncate ${weight}`}>{sender}</span>
      {message.messageCount > 1 && (
        <span
          title={`${message.messageCount} messages in this conversation · ${message.unreadMessages} unread`}
          className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums"
        >
          ({message.messageCount})
        </span>
      )}
    </span>
  );
  return (
    <li
      id={`message-${id}`}
      className={`border-b px-1 ${message.hasUnread ? "bg-background" : "bg-surface"}`}
    >
      <Button {...props} size="chip" className="hidden w-full justify-start text-left @lg:flex">
        <span className="flex w-full min-w-0 items-center gap-2 text-sm/4">
          <span className={`w-20 shrink-0 text-xs tabular-nums ${weight}`}>{time}</span>
          <span className="w-20 min-w-0 shrink-0 @xl:w-24 @2xl:w-32 @4xl:w-40">{from}</span>
          {titleLine}
          {unified && (
            <span className="w-24 shrink-0 truncate text-xs @2xl:w-32 @4xl:w-48">{address}</span>
          )}
        </span>
      </Button>
      <Button {...props} size="selection" className="w-full text-left @lg:hidden">
        <span className={`mr-2 w-20 shrink-0 text-xs whitespace-normal tabular-nums ${weight}`}>
          {time}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="flex min-w-0 items-center justify-between gap-2">
            {from}
            {unified && <span className="max-w-1/3 truncate text-xs">{address}</span>}
          </span>
          {titleLine}
        </span>
      </Button>
    </li>
  );
}
export function MessageList({
  messages,
  mailboxes,
  colors,
  selected,
  unified,
  allTags,
  onOpen,
}: {
  messages: MailConversation[];
  mailboxes: Mailbox[];
  colors: ReadonlyMap<string, MailColor>;
  selected: string | null;
  unified: boolean;
  allTags: boolean;
  onOpen: (message: MailConversation) => void;
}) {
  const accounts = new Map(mailboxes.map((box) => [box.id, box]));
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(
      () => setToday(new Date()),
      Math.max(1, midnight.getTime() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [today]);
  return (
    <div
      aria-label="Messages"
      role="region"
      className="@container min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto"
    >
      <ol>
        {messages.map((message) => {
          const mailbox = accounts.get(message.mailboxId);
          return (
            mailbox && (
              <MessageRow
                key={conversationKey(message)}
                message={message}
                mailbox={mailbox}
                color={colors.get(mailbox.id)!}
                selected={selected === conversationKey(message)}
                unified={unified}
                allTags={allTags}
                today={today}
                onOpen={onOpen}
              />
            )
          );
        })}
      </ol>
    </div>
  );
}

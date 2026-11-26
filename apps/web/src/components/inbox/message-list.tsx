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
import { rowStateVariants, rowTitleVariants } from "@/components/layout/row-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMailListDate, formatFullTimestamp } from "@/lib/format/date";
import { snippetText } from "@/lib/mail/body-text";
import { cn } from "cn";
import { Mail, Star } from "lucide-react";

function senderName(message: MailConversation) {
  return message.flags & (mailFlag.sent | mailFlag.drafts)
    ? `To: ${message.to || "No recipient"}`
    : message.from.replace(/\s*<[^>]+>\s*$/, "").replace(/^"(.+)"$/, "$1") ||
        message.from ||
        "Unknown sender";
}

function rowLabel(
  message: MailConversation,
  mailbox: Mailbox,
  sender: string,
  subject: string,
  stamp: string,
) {
  const labels = visibleLabels(mailbox, message.labelIds, true).map(labelName);
  return `${message.hasUnread ? "Unread. " : ""}${sender}: ${subject}. ${message.messageCount} messages. ${mailbox.address}, ${stamp}${labels.length ? `. Labels: ${labels.join(", ")}` : ""}`;
}

function MessageRow({
  message,
  mailbox,
  color,
  selected,
  checked,
  disabled,
  onCheck,
  unified,
  allTags,
  today,
  onOpen,
}: {
  message: MailConversation;
  mailbox: Mailbox;
  color: MailColor;
  selected: boolean;
  checked: boolean;
  disabled: boolean;
  onCheck: () => void;
  unified: boolean;
  allTags: boolean;
  today: Date;
  onOpen: (message: MailConversation) => void;
}) {
  const { id, timestamp } = message;
  const sender = senderName(message);
  const subject = message.subject || "(No subject)",
    stamp = formatMailListDate(timestamp, today);
  const weight = message.hasUnread ? rowTitleVariants({ state: "unread" }) : "font-normal";
  const background = message.hasUnread ? "bg-background" : "bg-surface";
  const rowSelected = checked || selected;
  const label = rowLabel(message, mailbox, sender, subject, stamp);
  return (
    <li
      id={`message-${id}`}
      className={cn(
        "flex items-start gap-1 border-b pr-1 pl-3 @3xl:items-center",
        !rowSelected && background,
        rowStateVariants({ selected: rowSelected, hover: false }),
      )}
    >
      <Checkbox
        aria-label={`Select conversation: ${subject}, ${mailbox.address}`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheck}
        className="mt-1.5 @3xl:mt-0"
      />
      <Button
        variant="sidebar"
        size="chip"
        aria-label={label}
        aria-current={selected ? "page" : undefined}
        data-mail-open
        disabled={disabled}
        onClick={() => onOpen(message)}
        className="min-w-0 flex-1 justify-start text-left"
      >
        <span className="relative flex w-full min-w-0 flex-col gap-1 @3xl:flex-row @3xl:items-center @3xl:gap-2">
          <span className="flex min-w-0 items-baseline justify-between gap-2 @3xl:contents">
            <span className="flex min-w-0 items-baseline gap-1 text-sm/4 @3xl:order-2 @3xl:w-32 @3xl:shrink-0 @4xl:w-40">
              <span className={`min-w-0 truncate ${weight}`} title={sender}>
                {sender}
              </span>
              {message.messageCount > 1 && (
                <span
                  title={`${message.messageCount} messages in this conversation · ${message.unreadMessages} unread`}
                  className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums"
                >
                  ({message.messageCount})
                </span>
              )}
            </span>
            <time
              dateTime={new Date(timestamp).toISOString()}
              title={formatFullTimestamp(timestamp)}
              className="shrink-0 text-xs font-normal whitespace-nowrap text-muted-foreground tabular-nums @3xl:order-1 @3xl:w-16"
            >
              {stamp}
            </time>
          </span>
          <span className="min-w-0 text-sm/5 text-foreground @3xl:order-4 @3xl:flex-1 @3xl:truncate @3xl:leading-4">
            <span title={subject} className={`line-clamp-2 wrap-anywhere @3xl:inline ${weight}`}>
              {message.hasStar && (
                <Star
                  aria-hidden
                  className="mr-1 inline size-3 fill-current align-baseline text-primary"
                />
              )}
              {subject}
            </span>
            <span className="ml-2 hidden text-xs font-normal text-muted-foreground @3xl:inline">
              {snippetText(message.snippet)}
            </span>
          </span>
          <span className="relative flex min-w-0 items-center justify-between gap-2 empty:hidden @3xl:contents">
            {unified && (
              <span
                title={mailbox.address}
                className="flex min-w-0 items-center gap-1 text-xs font-normal text-muted-foreground @3xl:order-5 @3xl:w-32 @3xl:shrink-0 @4xl:w-44"
              >
                <Mail aria-hidden className={`size-3 ${ink[color]}`} />
                <span className="truncate">{mailboxName(mailbox)}</span>
              </span>
            )}
            <MessageLabels mailbox={mailbox} ids={message.labelIds} compact all={allTags} />
          </span>
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
  checked,
  disabled,
  onCheck,
  unified,
  allTags,
  onOpen,
}: {
  messages: MailConversation[];
  mailboxes: Mailbox[];
  colors: ReadonlyMap<string, MailColor>;
  selected: string | null;
  checked: ReadonlySet<string>;
  disabled: boolean;
  onCheck: (message: MailConversation) => void;
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
                checked={checked.has(conversationKey(message))}
                disabled={disabled}
                onCheck={() => onCheck(message)}
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

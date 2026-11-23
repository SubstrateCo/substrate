import {
  mailboxName,
  mailFlag,
  type Mailbox,
  type MailHeader,
  type MailConversation,
} from "@substrate/contracts/mail";

import { useQuery } from "@tanstack/react-query";

import { useLayoutEffect, useRef } from "react";

import { MailBodyContent } from "./mail-body-content";
import { MessageLabels } from "./message-labels";
import type { ReadPicture } from "./newsletter";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageAside } from "@/components/layout/page-layout";
import { RowAction } from "@/components/layout/row-actions";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Heading } from "@/components/ui/heading";
import { snippetText } from "@/lib/mail/body-text";
import type { localMailQueries } from "@/queries/mail/options";
import { ChevronRight, MailOpen, X } from "lucide-react";

type BodyOptions = ReturnType<typeof localMailQueries>["body"];
function MessageContent({
  message,
  mailbox,
  bodyOptions,
  readPicture,
  showLabels = false,
}: {
  message: MailHeader;
  mailbox: Mailbox;
  bodyOptions: BodyOptions;
  readPicture: ReadPicture;
  showLabels?: boolean;
}) {
  const body = useQuery(bodyOptions(message.id, mailbox.lastSync));
  function content() {
    if (body.isPending) return <LoadingState label="Reading local message…" variant="compact" />;
    if (body.data && !body.isError)
      return <MailBodyContent body={body.data} id={message.id} readPicture={readPicture} />;
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Message unavailable.
      </p>
    );
  }
  return (
    <>
      <div className="mb-4 text-xs/5 text-muted-foreground">
        <p className="wrap-anywhere">To {message.to || "No recipient"}</p>
        {showLabels && <MessageLabels mailbox={mailbox} ids={message.labelIds} />}
      </div>
      {content()}
    </>
  );
}

function MessageHeading({ message }: { message: MailHeader }) {
  const { flags } = message;
  const folder = (
    [
      ["Trash", mailFlag.trash],
      ["Spam", mailFlag.spam],
      ["Draft", mailFlag.drafts],
      ["Sent", mailFlag.sent],
    ] as const
  ).find(([, flag]) => flags & flag)?.[0];
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
      <span className="min-w-0 truncate text-sm font-medium" title={message.from}>
        {message.from || "Unknown sender"}
      </span>
      {folder && <span className="text-xs text-muted-foreground">{folder}</span>}
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
        <Timestamp value={message.timestamp} format="datetime" />
      </span>
    </span>
  );
}

export function Reader({
  message,
  mailbox,
  messages,
  bodyOptions,
  readPicture,
  onClose,
}: {
  message: MailConversation;
  mailbox: Mailbox;
  messages?: MailHeader[];
  bodyOptions: BodyOptions;
  readPicture: ReadPicture;
  onClose: () => void;
}) {
  const subject = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    subject.current?.focus();
  }, [message.id]);
  return (
    <PageAside
      aria-label="Message reader"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <PageHeader
        variant="pane"
        title={mailboxName(mailbox)}
        icon={<MailOpen aria-hidden />}
        actions={
          <RowAction label="Close message" onClick={onClose}>
            <X aria-hidden />
          </RowAction>
        }
      />
      <article className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <Heading level={2} variant="record" ref={subject} tabIndex={-1} className="outline-none">
          {message.subject || "(No subject)"}
        </Heading>
        <MessageLabels
          mailbox={mailbox}
          ids={messages?.find((m) => m.id === message.id)?.labelIds ?? message.labelIds}
        />
        {messages && messages.length > 1 && (
          <p className="mt-1 text-xs text-muted-foreground">
            {messages.length} messages in this conversation
          </p>
        )}
        {!messages && <LoadingState label="Reading conversation…" variant="compact" />}
        {messages?.length === 0 && <p role="status">Conversation unavailable.</p>}
        {!!messages?.length && (
          <ol aria-label="Conversation messages" className="mt-3 divide-y border-t">
            {messages.map((m) => (
              <li key={m.id} className="py-3">
                {messages.length === 1 ? (
                  <>
                    <MessageHeading message={m} />
                    <MessageContent
                      message={m}
                      mailbox={mailbox}
                      bodyOptions={bodyOptions}
                      readPicture={readPicture}
                    />
                  </>
                ) : (
                  <Collapsible defaultOpen={m.id === message.id}>
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="disclosure"
                        size="selection"
                        className="group w-full text-left"
                      >
                        <ChevronRight
                          aria-hidden
                          className="shrink-0 group-data-[state=open]:rotate-90"
                        />
                        <span className="grid min-w-0 flex-1">
                          <MessageHeading message={m} />
                          <span className="truncate text-xs font-normal text-muted-foreground group-data-[state=open]:hidden">
                            {snippetText(m.snippet)}
                          </span>
                        </span>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="pt-1">
                        <MessageContent
                          message={m}
                          mailbox={mailbox}
                          bodyOptions={bodyOptions}
                          readPicture={readPicture}
                          showLabels={m.id !== message.id}
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </li>
            ))}
          </ol>
        )}
      </article>
    </PageAside>
  );
}

import {
  mailboxName,
  type Mailbox,
  type MailHeader,
  type MailConversation,
} from "@substrate/contracts/mail";

import { useLayoutEffect, useRef, useState } from "react";

import { MessageLabels } from "./message-labels";
import type { ReadPicture } from "./newsletter";
import type { ReaderActions } from "./reader-actions";
import { ReaderMessage } from "./reader-message";
import { ContentNotice } from "@/components/feedback/content-notice";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PageAside } from "@/components/layout/page-layout";
import { PageSheetBody } from "@/components/layout/page-sheet";
import { RowAction } from "@/components/layout/row-actions";
import { Heading } from "@/components/ui/heading";
import type { localMailQueries } from "@/queries/mail/options";
import { MailOpen, X } from "lucide-react";

export function Reader({
  message,
  mailbox,
  messages,
  bodyOptions,
  readPicture,
  actions,
  active,
  onClose,
}: {
  message: MailConversation;
  mailbox: Mailbox;
  messages?: MailHeader[];
  bodyOptions: ReturnType<typeof localMailQueries>["body"];
  readPicture: ReadPicture;
  actions: ReaderActions;
  active: boolean;
  onClose: () => void;
}) {
  const subject = useRef<HTMLHeadingElement>(null);
  const [opened, setOpened] = useState<string | null>(message.id);
  useLayoutEffect(() => {
    subject.current?.focus();
  }, [message.id]);
  return (
    <PageAside
      aria-label="Message reader"
      onKeyDown={(e) => {
        const inReader = e.target instanceof Node && e.currentTarget.contains(e.target);
        if (e.key === "Escape" && !e.defaultPrevented && inReader) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <PageHeader
        variant="pane"
        title="Email"
        icon={<MailOpen aria-hidden />}
        actions={
          <RowAction label="Close message" onClick={onClose}>
            <X aria-hidden />
          </RowAction>
        }
      />
      <PageSheetBody className="@container">
        <article aria-labelledby="inbox-reader-heading" className="grid min-w-0 gap-4">
          <header className="grid min-w-0 gap-2">
            <Heading
              id="inbox-reader-heading"
              level={2}
              variant="record"
              ref={subject}
              tabIndex={-1}
              className="outline-none"
            >
              {message.subject || "(No subject)"}
            </Heading>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="min-w-0 wrap-anywhere" title={mailbox.address}>
                {mailboxName(mailbox)}
              </span>
              {messages && messages.length > 1 && (
                <span>{messages.length} messages in this conversation</span>
              )}
              <MessageLabels
                mailbox={mailbox}
                ids={messages?.find((m) => m.id === message.id)?.labelIds ?? message.labelIds}
              />
            </div>
          </header>
          {!messages && <LoadingState label="Reading conversation…" variant="compact" />}
          {messages?.length === 0 && (
            <ContentNotice variant="inline" title="Conversation unavailable." />
          )}
          {!!messages?.length && (
            <ol aria-label="Conversation messages" className="grid min-w-0 gap-3">
              {messages.map((m) => (
                <li key={m.id}>
                  <ReaderMessage
                    message={m}
                    mailbox={mailbox}
                    bodyOptions={bodyOptions}
                    readPicture={readPicture}
                    actions={actions}
                    current={m.id === message.id}
                    multiple={messages.length > 1}
                    reading={active && (messages.length === 1 || opened === m.id)}
                    onToggle={(open) => {
                      if (open) setOpened(m.id);
                      else setOpened((current) => (current === m.id ? null : current));
                    }}
                  />
                </li>
              ))}
            </ol>
          )}
        </article>
      </PageSheetBody>
    </PageAside>
  );
}

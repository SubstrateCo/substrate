import { mailFlag, type Mailbox, type MailHeader } from "@substrate/contracts/mail";

import { useQuery } from "@tanstack/react-query";

import { useState } from "react";

import { MailBodyContent } from "./mail-body-content";
import { MessageLabels } from "./message-labels";
import type { ReadPicture } from "./newsletter";
import { ReaderActionBar, type ReaderActions } from "./reader-actions";
import { ContentNotice } from "@/components/feedback/content-notice";
import { LoadingState } from "@/components/feedback/loading-state";
import { Tag } from "@/components/feedback/tag";
import { Timestamp } from "@/components/time/timestamp";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { snippetText } from "@/lib/mail/body-text";
import type { localMailQueries } from "@/queries/mail/options";
import { ChevronDown } from "lucide-react";

type MessageProps = {
  message: MailHeader;
  mailbox: Mailbox;
  bodyOptions: ReturnType<typeof localMailQueries>["body"];
  readPicture: ReadPicture;
  actions: ReaderActions;
  reading: boolean;
  current: boolean;
};

function MessageContent({
  message,
  mailbox,
  bodyOptions,
  readPicture,
  actions,
  reading,
  current,
}: MessageProps) {
  const body = useQuery(bodyOptions(message.id, mailbox.lastSync));
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  function content() {
    if (body.isPending) return <LoadingState label="Reading local message…" variant="compact" />;
    if (body.data && !body.isError)
      return <MailBodyContent body={body.data} id={message.id} readPicture={readPicture} />;
    return <ContentNotice variant="inline" title="Message unavailable." />;
  }
  return (
    <div ref={setElement} className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid min-w-0 flex-1 basis-48 gap-1">
          <p className="text-sm wrap-anywhere">
            <span className="text-muted-foreground">To </span>
            {message.to || "No recipient"}
          </p>
          {!current && <MessageLabels mailbox={mailbox} ids={message.labelIds} />}
        </div>
        <ReaderActionBar
          message={message}
          mailbox={mailbox}
          readingElement={reading && body.isSuccess && body.data ? element : null}
          {...actions}
        />
      </div>
      {content()}
    </div>
  );
}

function MessageHeading({ message }: { message: MailHeader }) {
  const folder = (
    [
      ["Trash", mailFlag.trash],
      ["Spam", mailFlag.spam],
      ["Draft", mailFlag.drafts],
      ["Sent", mailFlag.sent],
    ] as const
  ).find(([, flag]) => message.flags & flag)?.[0];
  return (
    <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 @max-md:whitespace-normal">
      <span
        className="min-w-0 truncate text-sm font-medium text-foreground @max-md:wrap-anywhere @max-md:whitespace-normal"
        title={message.from}
      >
        {message.from || "Unknown sender"}
      </span>
      {folder && <Tag size="sm">{folder}</Tag>}
      <Timestamp
        value={message.timestamp}
        format="datetime"
        className="shrink-0 text-xs font-normal text-muted-foreground @md:ml-auto"
      />
    </span>
  );
}

export function ReaderMessage({
  multiple,
  onToggle,
  ...props
}: MessageProps & { multiple: boolean; onToggle: (open: boolean) => void }) {
  const { message, current } = props;
  const details = <MessageContent {...props} />;
  const heading = <MessageHeading message={message} />;
  if (!multiple)
    return (
      <div className="grid min-w-0 gap-2">
        {heading}
        {details}
      </div>
    );
  const preview = snippetText(message.snippet);
  return (
    <Collapsible defaultOpen={current} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="selection" className="group w-full text-left">
          <span className="flex w-full min-w-0 items-center justify-between gap-3">
            <span className="grid min-w-0 flex-1 gap-1">
              {heading}
              {preview && (
                <span className="truncate text-xs font-normal text-muted-foreground group-aria-expanded:hidden">
                  {preview}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="sr-only group-aria-expanded:hidden @md:not-sr-only">
                Show message
              </span>
              <span className="sr-only hidden group-aria-expanded:inline @md:not-sr-only">
                Hide message
              </span>
              <ChevronDown aria-hidden className="group-aria-expanded:rotate-180" />
            </span>
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pt-3">{details}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

import type { ReactNode } from "react";

import type { Message } from "@/api/messaging/requests";
import { ContentNotice } from "@/components/feedback/content-notice";
import { ErrorState } from "@/components/feedback/error-state";
import { ListBody } from "@/components/feedback/list-body";
import { SkeletonText } from "@/components/feedback/skeleton-text";
import { StaleNotice } from "@/components/feedback/stale-notice";
import { RecordSection } from "@/components/layout/record-section";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { messageAuthor, messageAuthorName } from "@/components/messaging/messages/message-author";
import { DeletedMessageBody } from "@/components/messaging/messages/message-placeholders";
import { ActorAvatar } from "@/components/people/actor-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { Skeleton } from "@/components/ui/skeleton";
import { plainReferenceText } from "@/lib/messaging/reference-token";
import { listPhase } from "@/lib/resource-state";

const previewLimit = 5;

export function DiscussionPreview({
  messages,
  loading,
  error,
  onRetry,
  conversationLink,
}: {
  messages: Message[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  conversationLink: ReactNode;
}) {
  const latest = messages.filter((message) => !message.threadId).slice(-previewLimit);
  return (
    <RecordSection aria-label="Discussion" title="Discussion" count={latest.length || undefined}>
      <ListBody
        phase={listPhase({ items: latest, loading, error })}
        loading={
          <div role="status" aria-label="Loading discussion">
            <ol aria-hidden="true" className="space-y-4">
              {[0, 1].map((index) => (
                <DiscussionRow
                  key={index}
                  avatar={
                    <div className="mt-0.5 size-6 shrink-0 overflow-hidden rounded-full">
                      <Skeleton className="size-full" />
                    </div>
                  }
                  byline={<SkeletonText width="6rem" />}
                  body={<SkeletonText width="12rem" />}
                />
              ))}
            </ol>
          </div>
        }
        error={<ErrorState variant="compact" title="Couldn’t load discussion" onRetry={onRetry} />}
        empty={<ContentNotice variant="inline" title="No messages yet" />}
        stale={<StaleNotice title="Couldn’t load discussion" onRetry={onRetry} />}
      >
        {() => (
          <ol className="space-y-4">
            {latest.map((message) => (
              <DiscussionRow
                key={message.id}
                avatar={<ActorAvatar actor={messageAuthor(message)} className="mt-0.5" />}
                byline={
                  <>
                    <span className="truncate text-xs font-medium">
                      {messageAuthorName(message)}
                    </span>
                    <Timestamp
                      value={message.createdAt}
                      className="shrink-0 text-xs text-muted-foreground"
                    />
                  </>
                }
                body={
                  message.deletedAt ? (
                    <DeletedMessageBody />
                  ) : (
                    <div className="line-clamp-3 max-h-16 overflow-hidden wrap-anywhere">
                      <MessageMarkdown
                        body={plainReferenceText(
                          message.body ||
                            (message.attachments.length ? "Shared an attachment" : ""),
                        )}
                      />
                    </div>
                  )
                }
              />
            ))}
          </ol>
        )}
      </ListBody>
      {conversationLink}
    </RecordSection>
  );
}

function DiscussionRow({
  avatar,
  byline,
  body,
}: {
  avatar: ReactNode;
  byline: ReactNode;
  body: ReactNode;
}) {
  return (
    <li className="flex min-w-0 gap-2">
      {avatar}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">{byline}</div>
        {body}
      </div>
    </li>
  );
}

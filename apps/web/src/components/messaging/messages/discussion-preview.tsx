import type { ReactNode } from "react";

import type { Message } from "@/api/messaging/requests";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { MessageMarkdown } from "@/components/messaging/markdown/message-markdown";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Timestamp } from "@/components/time/timestamp";
import { plainReferenceText } from "@/lib/messaging/reference-token";

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
    <section aria-label="Discussion" className="min-w-0 space-y-3 border-t pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">Discussion</h3>
        {latest.length > 0 && (
          <span className="text-xs text-muted-foreground">Latest {latest.length}</span>
        )}
      </div>
      {loading && <LoadingState label="Loading discussion" variant="compact" />}
      {error && <ErrorState compact title="Couldn’t load discussion" onRetry={onRetry} />}
      {!loading && !error && !latest.length && (
        <p className="text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
      )}
      {latest.length > 0 && (
        <ol className="space-y-4">
          {latest.map((message) => (
            <li key={message.id} className="flex min-w-0 gap-2">
              <PersonAvatar
                name={message.authorName || "Unknown member"}
                image={message.authorImage}
                agent={message.authorType === "agent"}
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-xs font-medium">
                    {message.authorName || "Unknown member"}
                  </span>
                  <Timestamp
                    value={message.createdAt}
                    className="shrink-0 text-xs text-muted-foreground"
                  />
                </div>
                {message.deletedAt ? (
                  <p className="text-sm text-muted-foreground italic">Message deleted</p>
                ) : (
                  <div className="line-clamp-3 max-h-16 overflow-hidden wrap-anywhere">
                    <MessageMarkdown
                      body={plainReferenceText(
                        message.body || (message.attachments.length ? "Shared an attachment" : ""),
                      )}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {conversationLink}
    </section>
  );
}

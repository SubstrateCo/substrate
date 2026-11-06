import type { ReactNode } from "react";
import { Hash, LockKeyhole, UserPlus } from "lucide-react";
import { conversationName, type Conversation } from "./types";
import { Button } from "../primitives/button";
import { PaneState } from "../feedback/pane-state";
import { ErrorState } from "../feedback/error-state";
import { isAccessFailure } from "../feedback/request-failure";

export function ConversationPane({
  conversation,
  loading = false,
  error,
  onRetry,
  addingMembers = false,
  onToggleMembers,
  membersForm,
  messages,
  hasLoaded = !!messages,
  composer,
  thread,
}: {
  conversation: Conversation;
  loading?: boolean;
  error?: Error | null;
  onRetry: () => void;
  addingMembers?: boolean;
  onToggleMembers: () => void;
  membersForm?: ReactNode;
  messages?: ReactNode;
  hasLoaded?: boolean;
  composer: ReactNode;
  thread?: ReactNode;
}) {
  const title = isAccessFailure(error)
    ? "Conversation unavailable"
    : conversationName(conversation);
  const blocked = !!error && (!hasLoaded || isAccessFailure(error));
  const initialLoading = loading && !hasLoaded;
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card/60 px-4 sm:px-5">
          <h1 className="flex min-w-0 items-center gap-2 font-semibold">
            {!isAccessFailure(error) &&
              conversation.kind === "channel" &&
              (conversation.private ? (
                <LockKeyhole className="size-4 shrink-0" />
              ) : (
                <Hash className="size-5 shrink-0" />
              ))}
            <span className="truncate">{title}</span>
          </h1>
          {!blocked && conversation.kind !== "dm" && (
            <Button
              variant="outline"
              size="icon-sm"
              onClick={onToggleMembers}
              aria-label="Add people"
              aria-expanded={addingMembers}
            >
              <UserPlus />
            </Button>
          )}
        </header>
        {!blocked && addingMembers && membersForm}
        {error && !blocked && (
          <div className="px-4 pt-3">
            <ErrorState
              compact
              title="Couldn’t refresh messages"
              description="Your loaded messages are still available. Try again for the latest messages."
              onRetry={onRetry}
            />
          </div>
        )}
        {blocked && <PaneState label="Conversation unavailable" error={error} onRetry={onRetry} />}
        {!blocked && initialLoading && <PaneState label="Loading messages…" />}
        {!blocked && !initialLoading && messages}
        {!blocked && !initialLoading && !messages && (
          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-6 py-8">
            <h2 className="mb-2 text-2xl font-semibold tracking-tight">
              {conversation.kind === "channel" ? "Welcome to " : "Your conversation with "}
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">
              This is the start of something. Send the first message.
            </p>
          </div>
        )}
        {!blocked && <div className="mt-auto shrink-0">{composer}</div>}
      </section>
      {!blocked && !initialLoading && thread}
    </div>
  );
}

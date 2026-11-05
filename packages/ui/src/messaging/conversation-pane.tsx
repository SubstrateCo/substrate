import type { ReactNode } from "react";
import { Hash, LockKeyhole, UserPlus } from "lucide-react";
import { conversationName, type Conversation } from "./types";
import { Button } from "../primitives/button";
import { PaneState } from "../feedback/pane-state";

export function ConversationPane({
  conversation,
  loading = false,
  error,
  onRetry,
  addingMembers = false,
  onToggleMembers,
  membersForm,
  messages,
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
  composer: ReactNode;
  thread?: ReactNode;
}) {
  const title = conversationName(conversation);
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card/60 px-4 sm:px-5">
          <h1 className="flex min-w-0 items-center gap-2 font-semibold">
            {conversation.kind === "channel" &&
              (conversation.private ? (
                <LockKeyhole className="size-4 shrink-0" />
              ) : (
                <Hash className="size-5 shrink-0" />
              ))}
            <span className="truncate">{title}</span>
          </h1>
          {!error && conversation.kind !== "dm" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleMembers}
              aria-expanded={addingMembers}
            >
              <UserPlus />
              <span className="hidden sm:inline">Add people</span>
            </Button>
          )}
        </header>
        {!error && addingMembers && membersForm}
        {error ? (
          <PaneState label="Conversation unavailable" error={error} onRetry={onRetry} />
        ) : loading ? (
          <PaneState label="Loading messages…" />
        ) : messages ? (
          messages
        ) : (
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
        {!error && <div className="mt-auto shrink-0">{composer}</div>}
      </section>
      {!error && !loading && thread}
    </div>
  );
}

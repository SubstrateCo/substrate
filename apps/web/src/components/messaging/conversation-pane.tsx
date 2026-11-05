import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Hash, LockKeyhole, UserPlus } from "lucide-react";
import { conversationName, type Conversation } from "@/lib/messaging";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-message";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { ThreadPane } from "./thread-pane";
import { AddMembersForm } from "./add-members-form";

export function ConversationPane({
  organizationId,
  conversation,
}: {
  organizationId: string;
  conversation: Conversation;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [addingMembers, setAddingMembers] = useState(false);
  const messages = useQuery(messagesQueryOptions(organizationId, conversation.id));
  const title = conversationName(conversation);
  if (messages.isError)
    return (
      <section className="min-w-0 flex-1 space-y-3 p-5">
        <FormMessage error={messages.error} />
        <Button variant="outline" onClick={() => void messages.refetch()}>
          Retry
        </Button>
      </section>
    );
  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <section aria-label={title} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-5">
          <h1 className="flex min-w-0 items-center gap-2 font-semibold">
            {conversation.kind === "channel" &&
              (conversation.private ? (
                <LockKeyhole className="size-4 shrink-0" />
              ) : (
                <Hash className="size-5 shrink-0" />
              ))}
            <span className="truncate">{title}</span>
          </h1>
          {conversation.kind !== "dm" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAddingMembers(!addingMembers)}
              aria-expanded={addingMembers}
            >
              <UserPlus />
              <span className="hidden sm:inline">Add people</span>
            </Button>
          )}
        </header>
        {addingMembers && (
          <AddMembersForm
            organizationId={organizationId}
            conversationId={conversation.id}
            onClose={() => setAddingMembers(false)}
          />
        )}
        {messages.isPending && (
          <p role="status" className="p-6 text-sm text-muted-foreground">
            Loading messages…
          </p>
        )}
        {messages.data && messages.data.length > 0 ? (
          <MessageList
            messages={messages.data}
            organizationId={organizationId}
            onThread={setThreadId}
          />
        ) : !messages.isPending ? (
          <div className="flex flex-1 flex-col justify-end px-6 py-8">
            <h2 className="mb-2 text-2xl font-semibold tracking-tight">
              {conversation.kind === "channel" ? "Welcome to " : "Your conversation with "}
              {title}
            </h2>
            <p className="text-sm text-muted-foreground">
              This is the start of something. Send the first message.
            </p>
          </div>
        ) : null}
        <div className="mt-auto">
          <Composer
            organizationId={organizationId}
            conversationId={conversation.id}
            label={`Message ${conversation.kind === "channel" ? "#" : ""}${title}`}
          />
        </div>
      </section>
      {threadId && (
        <ThreadPane
          key={threadId}
          organizationId={organizationId}
          conversationId={conversation.id}
          threadId={threadId}
          root={messages.data?.find((message) => message.id === threadId)}
          onClose={() => setThreadId(null)}
        />
      )}
    </div>
  );
}

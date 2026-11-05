import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { Message } from "@/lib/messaging";
import { messagesQueryOptions } from "@/queries/messaging/options";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/auth/form-message";
import { Composer } from "./composer";
import { MessageItem } from "./message-item";
import { MessageList } from "./message-list";

export function ThreadPane({
  organizationId,
  conversationId,
  threadId,
  root,
  onClose,
}: {
  organizationId: string;
  conversationId: string;
  threadId: string;
  root?: Message;
  onClose: () => void;
}) {
  const replies = useQuery(messagesQueryOptions(organizationId, conversationId, threadId));
  if (replies.isError)
    return (
      <aside
        aria-label="Thread"
        className="absolute inset-0 z-10 space-y-3 border-l bg-background p-5 lg:static lg:w-[380px]"
      >
        <div className="flex justify-between">
          <h2 className="font-semibold">Thread</h2>
          <Button size="icon" variant="ghost" aria-label="Close thread" onClick={onClose}>
            <X />
          </Button>
        </div>
        <FormMessage error={replies.error} />
        <Button variant="outline" onClick={() => void replies.refetch()}>
          Retry
        </Button>
      </aside>
    );
  return (
    <aside
      aria-label="Thread"
      className="absolute inset-0 z-10 flex min-h-0 flex-col border-l bg-background lg:static lg:w-[380px] lg:shrink-0 xl:w-[420px]"
    >
      <header className="flex h-16 shrink-0 items-center justify-between border-b px-5">
        <h2 className="font-semibold">Thread</h2>
        <Button size="icon" variant="ghost" aria-label="Close thread" onClick={onClose}>
          <X />
        </Button>
      </header>
      {root && (
        <div className="max-h-[35%] overflow-y-auto border-b">
          <MessageItem message={root} organizationId={organizationId} />
        </div>
      )}
      {replies.isPending && (
        <p role="status" className="p-5 text-sm text-muted-foreground">
          Loading replies…
        </p>
      )}
      {replies.data && (
        <MessageList
          messages={replies.data.filter((message) => message.id !== threadId)}
          organizationId={organizationId}
        />
      )}
      {!replies.isPending && !replies.data.length && (
        <p className="p-5 text-sm text-muted-foreground">No replies yet. Start the thread.</p>
      )}
      <div className="mt-auto">
        <Composer
          organizationId={organizationId}
          conversationId={conversationId}
          threadId={threadId}
          label="Reply in thread…"
        />
      </div>
    </aside>
  );
}

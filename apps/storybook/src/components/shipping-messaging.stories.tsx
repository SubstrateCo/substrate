import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Composer } from "@startup-os/ui/messaging/composer";
import { ComposerDraftProvider } from "@startup-os/ui/messaging/composer-drafts";
import { MessageHistory } from "@startup-os/ui/messaging/message-history";
import { MessageItem } from "@startup-os/ui/messaging/message-item";
import { MessageWorkActions } from "@startup-os/ui/messaging/message-work-actions";
import { LinkedMessage } from "@startup-os/ui/messaging/linked-message";
import { MessageUnavailable } from "@startup-os/ui/messaging/message-unavailable";
import { ConversationUnavailable } from "@startup-os/ui/messaging/conversation-unavailable";
import { CopyLink } from "@startup-os/ui/context/copy-link";
import { Button } from "@startup-os/ui/primitives/button";
import type { Message } from "@startup-os/ui/messaging/types";

const message: Message = {
  id: "launch",
  body: "Confirm the launch checklist before release.",
  authorName: "Alex Chen",
  authorId: "alex",
  createdAt: "2026-11-06T10:00:00Z",
  threadId: null,
  replyCount: 0,
  reactions: [{ emoji: "👍", count: 1, reacted: false }],
};

const meta = {
  title: "Messaging/Production compositions",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function ComposerWorkflow() {
  const [scope, setScope] = useState("channel");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [complete, setComplete] = useState<(() => void) | null>(null);
  const [sent, setSent] = useState("");
  let status = "No messages sent";
  if (sent) status = `Sent: ${sent}`;
  if (error) status = "Send failed";
  if (pending) status = "Sending message";
  return (
    <ComposerDraftProvider>
      <div className="mx-auto max-w-3xl p-4">
        <nav aria-label="Draft destination" className="flex flex-wrap gap-2">
          {["channel", "other channel", "thread A", "thread B", "other workspace"].map((name) => (
            <Button key={name} onClick={() => setScope(name)}>
              {name}
            </Button>
          ))}
        </nav>
        <Composer
          key={scope.startsWith("thread") ? scope : "conversation"}
          draftKey={`organization:${scope === "other workspace" ? "other" : "current"}:conversation:${scope === "other channel" ? "other" : "general"}:${scope.startsWith("thread") ? scope : "channel"}`}
          label={`Message ${scope}`}
          pending={pending}
          error={error}
          onSend={(body, onSuccess) => {
            setPending(true);
            setError(null);
            setSent(body);
            setComplete(() => onSuccess);
          }}
        />
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setPending(false);
              setError(new Error("Send failed"));
            }}
          >
            Fail send
          </Button>
          <Button
            onClick={() => {
              complete?.();
              setPending(false);
              setError(null);
            }}
          >
            Complete send
          </Button>
        </div>
        <p role="status">{status}</p>
      </div>
    </ComposerDraftProvider>
  );
}
export const ComposerDestinations: Story = { render: () => <ComposerWorkflow /> };

function ActionStrip() {
  const [action, setAction] = useState("");
  const [reacted, setReacted] = useState(false);
  return (
    <div className="mx-auto max-w-3xl p-4">
      <MessageItem
        message={{ ...message, reactions: [{ emoji: "👍", count: reacted ? 2 : 1, reacted }] }}
        onReact={() => setReacted(!reacted)}
        onThread={() => setAction("Thread opened")}
        actions={
          <>
            <CopyLink label="Copy message link" onCopy={() => Promise.resolve()} />
            <MessageWorkActions
              onCreate={() => setAction("Create task selected")}
              onLink={() => setAction("Link existing work selected")}
            />
          </>
        }
      />
      <p role="status">{action}</p>
    </div>
  );
}
export const MessageActions: Story = { render: () => <ActionStrip /> };

function History({ replies = false }: { replies?: boolean }) {
  const [older, setOlder] = useState(false);
  return (
    <div className="mx-auto max-w-3xl p-4">
      <MessageHistory
        replies={replies}
        hasOlder={!older}
        hasPrevious={older}
        onOlder={() => setOlder(true)}
        onLatest={() => setOlder(false)}
      >
        <MessageItem
          message={{
            ...message,
            body: older ? "Earlier launch discussion" : "Latest launch update",
          }}
          onReact={() => {}}
        />
      </MessageHistory>
    </div>
  );
}
export const MessagesHistory: Story = { render: () => <History /> };
export const RepliesHistory: Story = { render: () => <History replies /> };

function PendingHistory({
  replies = false,
  refreshing = false,
}: {
  replies?: boolean;
  refreshing?: boolean;
}) {
  const [pending, setPending] = useState<"older" | "latest" | "refresh" | undefined>(
    refreshing ? "refresh" : undefined,
  );
  const [destination, setDestination] = useState("Current launch discussion");
  const [body, setBody] = useState("Current launch discussion");
  return (
    <div className="mx-auto max-w-3xl p-4">
      <MessageHistory
        replies={replies}
        pending={pending}
        hasOlder
        hasPrevious
        onOlder={() => {
          setDestination("Older launch discussion");
          setPending("older");
        }}
        onLatest={() => {
          setDestination("Latest launch discussion");
          setPending("latest");
        }}
      >
        <MessageItem message={{ ...message, body }} onReact={() => {}} />
      </MessageHistory>
      <Button
        disabled={!pending}
        onClick={() => {
          setBody(destination);
          setPending(undefined);
        }}
      >
        Complete history request
      </Button>
    </div>
  );
}
export const PendingMessagesHistory: Story = { render: () => <PendingHistory /> };
export const PendingRepliesHistory: Story = { render: () => <PendingHistory replies /> };
export const RefreshingMessagesHistory: Story = { render: () => <PendingHistory refreshing /> };
export const RefreshingRepliesHistory: Story = {
  render: () => <PendingHistory replies refreshing />,
};

function LinkedTarget() {
  const [highlighted, setHighlighted] = useState(false);
  return (
    <div className="p-4">
      <Button onClick={() => setHighlighted(!highlighted)}>Toggle linked target</Button>
      <section aria-label="Message history" className="mt-4 h-64 overflow-auto border">
        <div className="h-96" aria-hidden="true" />
        <LinkedMessage highlighted={highlighted}>
          <MessageItem message={message} onReact={() => {}} />
        </LinkedMessage>
        <div className="h-96" aria-hidden="true" />
      </section>
    </div>
  );
}
export const LinkedTargetScroll: Story = { render: () => <LinkedTarget /> };

function Unavailable() {
  const [retried, setRetried] = useState(false);
  return (
    <div className="p-4">
      {retried ? (
        <MessageItem message={message} onReact={() => {}} />
      ) : (
        <MessageUnavailable onRetry={() => setRetried(true)} />
      )}
    </div>
  );
}
export const MessageRecovery: Story = { render: () => <Unavailable /> };
export const ConversationAccess: Story = { render: () => <ConversationUnavailable /> };

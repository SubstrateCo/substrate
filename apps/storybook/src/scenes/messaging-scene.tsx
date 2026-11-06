import { useState } from "react";
import { WorkspaceShell } from "@startup-os/ui/workspace/workspace-shell";
import { SignOutButton } from "@startup-os/ui/auth/sign-out-button";
import { OrganizationSwitcher } from "@startup-os/ui/organizations/organization-switcher";
import { MessagingWorkspace } from "@startup-os/ui/messaging/messaging-workspace";
import { ConversationPane } from "@startup-os/ui/messaging/conversation-pane";
import { ThreadPane } from "@startup-os/ui/messaging/thread-pane";
import { MessageItem } from "@startup-os/ui/messaging/message-item";
import { MessageList } from "@startup-os/ui/messaging/message-list";
import { Composer } from "@startup-os/ui/messaging/composer";
import { CreateConversationForm } from "@startup-os/ui/messaging/create-conversation-form";
import { AddMembersForm } from "@startup-os/ui/messaging/add-members-form";
import { conversationName, type Conversation, type Message } from "@startup-os/ui/messaging/types";
import {
  conversations as fixtures,
  messages as messageFixtures,
  replies,
  organizations,
} from "../fixtures";

export type MessagingSceneProps = {
  state?: "ready" | "empty" | "loading" | "error" | "stale" | "revoked";
  conversationId?: string;
  messageState?: "ready" | "empty" | "loading" | "error";
  threadState?: "closed" | "ready" | "empty" | "loading" | "error";
  composerState?: "ready" | "pending" | "error";
  creatingKind?: Conversation["kind"];
  membersOpen?: boolean;
  mobileSidebarOpen?: boolean;
  member?: boolean;
  longContent?: boolean;
};

export function MessagingScene({
  state = "ready",
  conversationId = "general",
  messageState = "ready",
  threadState = "closed",
  composerState = "ready",
  creatingKind,
  membersOpen = false,
  mobileSidebarOpen = false,
  member = false,
  longContent = false,
}: MessagingSceneProps) {
  const [selectedId, setSelectedId] = useState(conversationId);
  const [creating, setCreating] = useState(creatingKind);
  const [sidebarOpen, setSidebarOpen] = useState(mobileSidebarOpen);
  const [addingMembers, setAddingMembers] = useState(membersOpen);
  const [threadId, setThreadId] = useState<string | null>(threadState === "closed" ? null : "plan");
  const [messagesByConversation, setMessages] = useState<Record<string, Message[]>>({});
  const [repliesByThread, setReplies] = useState<Record<string, Message[]>>(
    threadState === "empty" ? {} : { "general:plan": replies },
  );
  const threadKey = `${selectedId}:${threadId}`;
  const threadReplies = repliesByThread[threadKey] ?? [];
  const [items, setItems] = useState(state === "ready" ? fixtures : []);
  const [notice, setNotice] = useState<Error | null>(null);
  const visible = state === "ready" || state === "empty" ? items : [];
  const selected = visible.find((item) => item.id === selectedId);
  const baseMessages =
    messageState === "empty" || messageState === "loading" ? [] : messageFixtures;
  const timeline =
    messagesByConversation[selectedId] ??
    (longContent
      ? [
          {
            ...messageFixtures[0],
            id: "long-message",
            authorName: "Alexandria Morgan With A Very Long Display Name",
            body: "AnUnbrokenMessageThatMustWrap".repeat(20),
          },
          ...baseMessages,
        ]
      : baseMessages);
  let error: Error | null = null;
  if (state === "stale") {
    error = new Error("Your active workspace changed. Reload this page to continue.");
  } else if (state === "revoked") {
    error = new Error("You are not a member of this organization");
  } else if (state === "error") {
    error = new Error("Could not load conversations. Please try again.");
  }
  const addMessage = (body: string, thread: boolean) => {
    const message: Message = {
      ...messageFixtures[0],
      id: `local-${timeline.length}-${threadReplies.length}`,
      body,
      authorName: "Taylor Kim",
      authorId: "taylor",
      threadId: thread ? threadId : null,
      replyCount: 0,
      reactions: [],
    };
    if (thread) {
      setReplies({ ...repliesByThread, [threadKey]: [...threadReplies, message] });
      setMessages({
        ...messagesByConversation,
        [selectedId]: timeline.map((item) =>
          item.id === threadId ? { ...item, replyCount: item.replyCount + 1 } : item,
        ),
      });
    } else setMessages({ ...messagesByConversation, [selectedId]: [...timeline, message] });
  };
  const renderMessage = (message: Message, inThread = false, root = false) => (
    <MessageItem
      key={message.id}
      message={message}
      onThread={inThread || root ? undefined : setThreadId}
      onReact={(emoji) => {
        const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
        const reactions = existing
          ? message.reactions.flatMap((reaction) => {
              if (reaction.emoji !== emoji) return [reaction];
              if (reaction.reacted && reaction.count === 1) return [];
              return [
                {
                  ...reaction,
                  count: reaction.count + (reaction.reacted ? -1 : 1),
                  reacted: !reaction.reacted,
                },
              ];
            })
          : [...message.reactions, { emoji, count: 1, reacted: true }];
        if (inThread)
          setReplies({
            ...repliesByThread,
            [threadKey]: threadReplies.map((item) =>
              item.id === message.id ? { ...item, reactions } : item,
            ),
          });
        else
          setMessages({
            ...messagesByConversation,
            [selectedId]: timeline.map((item) =>
              item.id === message.id ? { ...item, reactions } : item,
            ),
          });
      }}
    />
  );
  const composer = (thread = false) => (
    <Composer
      key={`${selectedId}-${thread}`}
      label={
        thread
          ? "Reply in thread…"
          : `Message ${selected?.kind === "channel" ? "#" : ""}${selected ? conversationName(selected) : ""}`
      }
      pending={composerState === "pending"}
      error={
        composerState === "error"
          ? new Error("Message could not be sent. Your draft is still here.")
          : null
      }
      defaultValue={composerState === "ready" ? "" : "Please review the launch plan."}
      onSend={(body, onSuccess) => {
        addMessage(body, thread);
        onSuccess();
      }}
    />
  );

  return (
    <WorkspaceShell
      name="Taylor Kim"
      view="messages"
      onViewChange={() =>
        setNotice(new Error("Open Scenes / Settings to inspect workspace settings."))
      }
      showOrganizationSettings={!member}
      organizationName="Launch Studio"
      notice={notice?.message}
      switcher={
        <OrganizationSwitcher
          organizationId="studio"
          name="Launch Studio"
          compact
          organizations={organizations}
          onSelect={() => setNotice(new Error("Workspace switching is a preview only."))}
          manageHref="?path=/story/scenes-workspaces--populated"
        />
      }
      signOut={
        <SignOutButton
          onSignOut={() =>
            setNotice(new Error("Sign out is a preview only. No account is connected."))
          }
        />
      }
    >
      <MessagingWorkspace
        conversations={visible}
        selectedId={creating ? undefined : selected?.id}
        sidebarOpen={sidebarOpen}
        onSidebarOpenChange={setSidebarOpen}
        loading={state === "loading"}
        error={error}
        onRetry={() => setNotice(new Error("Retry is a preview only. No backend is connected."))}
        onSelect={(id) => {
          setSelectedId(id);
          setCreating(undefined);
          setSidebarOpen(false);
          setThreadId(null);
          setAddingMembers(false);
        }}
        onCreate={(kind) => {
          setCreating(kind);
          setSidebarOpen(false);
        }}
      >
        {creating && (
          <CreateConversationForm
            key={creating}
            kind={creating}
            onSubmit={(draft) => {
              const id = `new-${items.length}`;
              setItems([
                ...items,
                {
                  id,
                  kind: creating,
                  name: draft.name || draft.emails,
                  private: creating !== "channel" || draft.isPrivate,
                },
              ]);
              setMessages({ ...messagesByConversation, [id]: [] });
              setSelectedId(id);
              setCreating(undefined);
            }}
          />
        )}
        {!creating && selected && (
          <ConversationPane
            conversation={selected}
            loading={messageState === "loading"}
            error={
              messageState === "error"
                ? new Error("Conversation not found or access denied.")
                : null
            }
            onRetry={() => {}}
            addingMembers={addingMembers}
            onToggleMembers={() => setAddingMembers(!addingMembers)}
            membersForm={
              <AddMembersForm
                onSubmit={() => setAddingMembers(false)}
                onClose={() => setAddingMembers(false)}
              />
            }
            messages={
              timeline.length ? (
                <MessageList lastId={timeline.at(-1)?.id}>
                  {timeline.map((message) => renderMessage(message))}
                </MessageList>
              ) : undefined
            }
            composer={composer()}
            thread={
              threadId && (
                <ThreadPane
                  onClose={() => setThreadId(null)}
                  loading={threadState === "loading"}
                  error={threadState === "error" ? new Error("Could not load replies.") : null}
                  onRetry={() => {}}
                  root={renderMessage(
                    timeline.find((message) => message.id === threadId) ?? messageFixtures[0],
                    false,
                    true,
                  )}
                  replies={
                    threadState !== "loading" && threadState !== "error" ? (
                      <MessageList lastId={threadReplies.at(-1)?.id}>
                        {threadReplies.map((message) => renderMessage(message, true))}
                      </MessageList>
                    ) : undefined
                  }
                  composer={composer(true)}
                />
              )
            }
          />
        )}
      </MessagingWorkspace>
    </WorkspaceShell>
  );
}

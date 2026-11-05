import type { Conversation, Message } from "@startup-os/ui/messaging/types";
import type { InvitationListItem } from "@startup-os/ui/organizations/invitation-manager";

export const conversations: Conversation[] = [
  { id: "general", kind: "channel", name: "general", private: false },
  { id: "launch", kind: "channel", name: "launch-planning", private: true },
  { id: "alex", kind: "dm", name: "Alex Morgan", private: true },
  { id: "group", kind: "group", name: "Launch team", private: true },
  { id: "unnamed", kind: "group", name: null, private: true },
];

export const messages: Message[] = [
  {
    id: "plan",
    authorId: "alex",
    authorName: "Alex Morgan",
    createdAt: "2026-11-05T09:00:00Z",
    body: "The launch plan is ready. **What should we ship first?** 🚀",
    threadId: null,
    replyCount: 2,
    reactions: [
      { emoji: "👍", count: 3, reacted: true },
      { emoji: "🚀", count: 2, reacted: false },
    ],
  },
  {
    id: "review",
    authorId: "sam",
    authorName: "Sam Rivera",
    createdAt: "2026-11-05T09:05:00Z",
    body: "Let's review the [project brief](https://example.com).\n\n- Finish onboarding\n- Review mobile layouts\n- Ship the first workspace\n\n> A little less switching. A lot more doing.",
    threadId: null,
    replyCount: 0,
    reactions: [],
  },
  {
    id: "code",
    authorId: "jordan",
    authorName: "Jordan Lee",
    createdAt: "2026-11-05T09:10:00Z",
    body: "The API is ready:\n\n```ts\nconst workspace = { name: 'Launch team', ready: true };\n```\n\n| Area | Status |\n| --- | --- |\n| Messaging | Ready |\n| Mobile | In review |",
    threadId: null,
    replyCount: 0,
    reactions: [{ emoji: "🎉", count: 1, reacted: false }],
  },
];

export const replies: Message[] = [
  {
    ...messages[1],
    id: "reply-one",
    body: "Onboarding first. I can review it today.",
    threadId: "plan",
    replyCount: 0,
  },
  {
    ...messages[0],
    id: "reply-two",
    body: "Agreed. Let's keep the mobile flow simple.",
    threadId: "plan",
    replyCount: 0,
    reactions: [],
  },
];

export const organizations = [
  { id: "studio", name: "Launch Studio" },
  { id: "partners", name: "Partner Workspace" },
];

export const invitations: InvitationListItem[] = [
  {
    id: "pending",
    email: "alex@example.com",
    role: "member",
    status: "pending",
    expired: false,
    expiresAt: "2026-11-12T10:30:00Z",
  },
  {
    id: "accepted",
    email: "sam@example.com",
    role: "admin",
    status: "accepted",
    expired: false,
    expiresAt: "2026-11-14T14:00:00Z",
  },
  {
    id: "canceled",
    email: "jordan@example.com",
    role: "member",
    status: "canceled",
    expired: false,
    expiresAt: "2026-11-10T09:00:00Z",
  },
  {
    id: "expired",
    email: "lee@example.com",
    role: "owner",
    status: "pending",
    expired: true,
    expiresAt: "2026-11-01T09:00:00Z",
  },
];

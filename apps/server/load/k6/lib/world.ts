import type { LoadUser } from "../../types.ts";

/** Response rows the flows use. Fields are the subset read by the load test. */
interface ConversationMember {
  actorId: string;
  type: "human" | "agent";
  userId: string | null;
  agentId: string | null;
  name: string;
  image: string | null;
}

export interface Conversation {
  id: string;
  kind: "dm" | "group" | "channel";
  name: string;
  private: boolean;
  joined: boolean;
  canPost: boolean;
  task: { taskEntityId: string; projectEntityId: string; title: string } | null;
  members: ConversationMember[];
}

export interface Message {
  id: string;
  conversationId: string;
  threadId: string | null;
  authorActorEntityId: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  canModify: boolean;
  replyCount: number;
  reactions: { emoji: string; count: number; reacted: boolean }[];
  attachments: { id: string; filename: string }[];
}

/** One message's context row (POST /context/message-page): its work links. */
export interface ContextRow {
  messageId: string;
  links: { entityId: string; projectEntityId?: string | null }[];
}

export interface Person {
  userId: string;
  name: string;
  email: string;
  image: string | null;
}

interface WorkRecord {
  entityId: string;
  title: string;
  /** Set on tasks. */
  projectEntityId?: string;
}

/**
 * What one VU's client knows. It is filled only from API responses and hints, like the web app's
 * cache; flows read it to choose what to do and update it from what they fetch.
 */
export interface World {
  user: LoadUser;
  organizationId: string;
  userId: string;
  /** The user's actor entity ID in this organization, from conversation members. */
  actorId?: string;
  people: Person[];
  conversations: Conversation[];
  /** Unread count per conversation ID, from GET /messaging/unread. */
  unread: Map<string, number>;
  /** When each conversation last showed activity (a hint or a newer message), epoch ms. */
  activity: Map<string, number>;
  /** The latest page seen per conversation, oldest first. */
  messages: Map<string, Message[]>;
  /** Context rows this client holds per conversation and message; null: the message has none. */
  contextIds: Map<string, Map<string, ContextRow | null>>;
  projects: WorkRecord[];
  tasks: WorkRecord[];
  hasUnreadNotifications: boolean;
  /** The open conversation and thread on the messages screen. */
  screen: { conversationId?: string; threadId?: string; olderCursor?: string };
}

export function createWorld(user: LoadUser): World {
  return {
    user,
    organizationId: user.organizationId,
    userId: user.userId,
    people: [],
    conversations: [],
    unread: new Map<string, number>(),
    activity: new Map<string, number>(),
    messages: new Map<string, Message[]>(),
    contextIds: new Map<string, Map<string, ContextRow | null>>(),
    projects: [],
    tasks: [],
    hasUnreadNotifications: false,
    screen: {},
  };
}

export function applyConversations(world: World, conversations: Conversation[]) {
  world.conversations = conversations;
  for (const conversation of conversations) {
    const self = conversation.members.find((member) => member.userId === world.userId);
    if (self) world.actorId = self.actorId;
  }
}

export function applyUnread(world: World, rows: { conversationId: string; unreadCount: number }[]) {
  world.unread = new Map(rows.map((row) => [row.conversationId, row.unreadCount]));
}

/** Stores the latest page and returns how many of its messages are new to this client. */
export function applyLatestMessages(world: World, conversationId: string, rows: Message[]) {
  const known = new Set((world.messages.get(conversationId) ?? []).map((message) => message.id));
  world.messages.set(conversationId, rows);
  const newest = rows.at(-1);
  if (newest) {
    const at = Date.parse(newest.createdAt);
    if (at > (world.activity.get(conversationId) ?? 0)) world.activity.set(conversationId, at);
  }
  return rows.filter((message) => !known.has(message.id)).length;
}

export function joinedConversations(world: World) {
  return world.conversations.filter((conversation) => conversation.joined);
}

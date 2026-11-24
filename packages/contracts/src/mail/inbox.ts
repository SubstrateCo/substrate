export const mailViews = [
  "inbox",
  "new",
  "unread",
  "starred",
  "drafts",
  "sent",
  "archive",
  "spam",
  "trash",
] as const;
export type MailView = (typeof mailViews)[number];
export const mailPageSize = 50;

// Independent properties: a message sent to oneself can be both sent and in the inbox.
export const mailFlag = {
  inbox: 1,
  unread: 2,
  starred: 4,
  drafts: 8,
  sent: 16,
  spam: 32,
  trash: 64,
} as const;
export function mailViewRule(view: MailView, now: number) {
  let exclude = mailFlag.spam | mailFlag.trash;
  let require = 0;
  if (view === "archive") exclude |= mailFlag.inbox | mailFlag.sent | mailFlag.drafts;
  else if (view === "new") require = mailFlag.inbox;
  else require = mailFlag[view];
  if (view === "trash") exclude = 0;
  if (view === "spam") exclude = mailFlag.trash;
  return { require, exclude, since: view === "new" ? now - 86_400_000 : null };
}

export const mailColors = [
  "Indigo",
  "Teal",
  "Amber",
  "Blue",
  "Rose",
  "Violet",
  "Green",
  "Slate",
] as const;
export type MailColor = (typeof mailColors)[number];
// An absent color uses the automatic palette. Overrides are local, not Gmail label changes.
export const labelFilterModes = ["show", "unread", "hide"] as const;
export type LabelFilterMode = (typeof labelFilterModes)[number];
export type MailLabel = {
  id: string;
  name: string;
  color?: MailColor;
  filterMode?: LabelFilterMode;
  hideInRows?: boolean;
};
export type Mailbox = {
  id: string;
  address: string;
  nickname: string | null;
  canModify: boolean;
  labels: MailLabel[];
  showLabelFilters: boolean;
  unreadLabelIds: string[];
  lastSync: number | null;
  status: "idle" | "syncing" | "retry" | "reconnect";
};
export const mailboxName = (box: Pick<Mailbox, "nickname" | "address">) =>
  box.nickname?.trim() || box.address;
export const filterLabels = (box: Mailbox) => {
  if (box.showLabelFilters === false) return [];
  const unread = new Set(box.unreadLabelIds);
  return box.labels.filter(
    (l) => l.filterMode !== "hide" && (l.filterMode !== "unread" || unread.has(l.id)),
  );
};
export type MailHeader = {
  id: string;
  mailboxId: string;
  subject: string;
  from: string;
  to: string;
  timestamp: number;
  snippet: string;
  flags: number;
  labelIds: string[];
};
export type MailBody = { text: string; format: "plain" | "html"; plainText?: string };
export const mailMessageActions = ["markRead", "markUnread", "trashMessage"] as const;
export type MailMessageAction = (typeof mailMessageActions)[number];
/** In a filtered view the row's id identifies the matching message to expand. */
export type MailConversation = MailHeader & {
  threadId: string | null;
  messageCount: number;
  unreadMessages: number;
  hasUnread: boolean;
  hasStar: boolean;
};
export const conversationKey = (
  c: Pick<MailConversation, "mailboxId" | "id"> & { threadId?: string | null },
) =>
  JSON.stringify(c.threadId ? [c.mailboxId, "thread", c.threadId] : [c.mailboxId, "message", c.id]);
export type MailPage = {
  items: MailConversation[];
  newCount: number;
  unreadCount: number;
  unreadByMailbox: Record<string, number>;
  draftCount: number;
};

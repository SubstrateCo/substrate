import {
  Archive,
  FilePenLine,
  Inbox,
  Mail,
  MailPlus,
  ShieldAlert,
  Send,
  Star,
  Trash2,
} from "lucide-react";

export const views = {
  inbox: {
    label: "Inbox",
    icon: Inbox,
    empty: "Your inbox is empty",
    hint: "Incoming mail appears here.",
  },
  new: {
    label: "New",
    icon: MailPlus,
    empty: "No new messages",
    hint: "Inbox arrivals from the last 24 hours appear here.",
  },
  unread: {
    label: "Unread",
    icon: Mail,
    empty: "No unread messages",
    hint: "You’re caught up in this mailbox.",
  },
  starred: {
    label: "Starred",
    icon: Star,
    empty: "No starred messages",
    hint: "Messages starred in your mailbox appear here.",
  },
  drafts: {
    label: "Drafts",
    icon: FilePenLine,
    empty: "No drafts",
    hint: "Drafts from your mailbox appear here.",
  },
  sent: {
    label: "Sent",
    icon: Send,
    empty: "No sent messages",
    hint: "Messages you send appear here.",
  },
  archive: {
    label: "Archive",
    icon: Archive,
    empty: "No archived messages",
    hint: "Archived mail appears here.",
  },
  spam: {
    label: "Spam",
    icon: ShieldAlert,
    empty: "No spam",
    hint: "Messages moved to spam appear here.",
  },
  trash: {
    label: "Trash",
    icon: Trash2,
    empty: "Trash is empty",
    hint: "Messages in your mailbox’s trash appear here.",
  },
};

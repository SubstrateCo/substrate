import type { ShortcutId } from "@substrate/contracts/desktop/shortcuts";

import type { LinkProps } from "@tanstack/react-router";

import {
  Activity,
  Bell,
  Bot,
  CalendarDays,
  Handshake,
  ListTodo,
  Mail,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

type WorkspaceApp = {
  label: string;
  icon: LucideIcon;
  to: NonNullable<LinkProps["to"]>;
  shortcut: ShortcutId;
};

export const workspaceApps = [
  {
    id: "messages",
    label: "Messages",
    icon: MessageSquare,
    to: "/messages",
    shortcut: "app.messages",
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: ListTodo,
    to: "/tasks",
    shortcut: "app.tasks",
  },
  { id: "inbox", label: "Inbox", icon: Mail, to: "/inbox", shortcut: "app.inbox" },
  { id: "crm", label: "CRM", icon: Handshake, to: "/crm", shortcut: "app.crm" },

  {
    id: "interactions",
    label: "Interactions",
    icon: Activity,
    to: "/interactions",
    shortcut: "app.interactions",
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    to: "/calendar",
    shortcut: "app.calendar",
  },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    to: "/agents",
    shortcut: "app.agents",
  },
] as const satisfies ReadonlyArray<WorkspaceApp & { id: string }>;

export const notificationsApp = {
  label: "Notifications",
  icon: Bell,
  to: "/notifications",
  shortcut: "app.notifications",
} as const satisfies WorkspaceApp;

export type WorkspaceAppId = (typeof workspaceApps)[number]["id"];

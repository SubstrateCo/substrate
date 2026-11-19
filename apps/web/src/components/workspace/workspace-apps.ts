import type { HotkeySequence } from "@tanstack/react-hotkeys";
import type { LinkProps } from "@tanstack/react-router";

import {
  Bell,
  Bot,
  Handshake,
  ListTodo,
  MessageSquare,
  Users,
  type LucideIcon,
} from "lucide-react";

type WorkspaceApp = {
  label: string;
  icon: LucideIcon;
  to: NonNullable<LinkProps["to"]>;
  hotkey: HotkeySequence;
};

/** The apps in the rail, in rail order. Each app's route decides when it is active. */
export const workspaceApps = [
  {
    id: "messages",
    label: "Messages",
    icon: MessageSquare,
    to: "/dashboard",
    hotkey: ["G", "M"],
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: ListTodo,
    to: "/tasks",
    hotkey: ["G", "T"],
  },
  { id: "crm", label: "CRM", icon: Handshake, to: "/crm", hotkey: ["G", "C"] },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    to: "/agents",
    hotkey: ["G", "A"],
  },
  {
    id: "contacts",
    label: "Contacts",
    icon: Users,
    to: "/contacts",
    hotkey: ["G", "P"],
  },
] as const satisfies ReadonlyArray<WorkspaceApp & { id: string }>;

export const notificationsApp = {
  label: "Notifications",
  icon: Bell,
  to: "/notifications",
  hotkey: ["G", "N"],
} as const satisfies WorkspaceApp;

export type WorkspaceAppId = (typeof workspaceApps)[number]["id"];

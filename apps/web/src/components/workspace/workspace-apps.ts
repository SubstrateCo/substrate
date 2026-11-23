import type { HotkeySequence } from "@tanstack/react-hotkeys";
import type { LinkProps } from "@tanstack/react-router";

import {
  Activity,
  Bell,
  Bot,
  CalendarDays,
  Handshake,
  House,
  ListTodo,
  MessageSquare,
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
    id: "home",
    label: "Home",
    icon: House,
    to: "/dashboard",
    hotkey: ["G", "H"],
  },
  {
    id: "messages",
    label: "Messages",
    icon: MessageSquare,
    to: "/messages",
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
    id: "interactions",
    label: "Interactions",
    icon: Activity,
    to: "/interactions",
    hotkey: ["G", "I"],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: CalendarDays,
    to: "/calendar",
    hotkey: ["G", "L"],
  },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    to: "/agents",
    hotkey: ["G", "A"],
  },
] as const satisfies ReadonlyArray<WorkspaceApp & { id: string }>;

export const notificationsApp = {
  label: "Notifications",
  icon: Bell,
  to: "/notifications",
  hotkey: ["G", "N"],
} as const satisfies WorkspaceApp;

export type WorkspaceAppId = (typeof workspaceApps)[number]["id"];

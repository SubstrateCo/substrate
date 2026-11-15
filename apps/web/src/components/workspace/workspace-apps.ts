import type { AppHotkeyId } from "@tanstack/react-hotkeys";
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
  id: string;
  label: string;
  icon: LucideIcon;
  to: NonNullable<LinkProps["to"]>;
  /** The app shortcut that opens this app, declared in `app-hotkeys.ts`. */
  hotkey: AppHotkeyId;
  /** Rail position. Bottom apps sit above the user menu. */
  placement: "top" | "bottom";
};

/** The apps in the rail, in rail order. Each app's route decides when it is active. */
export const workspaceApps = [
  {
    id: "messages",
    label: "Messages",
    icon: MessageSquare,
    to: "/dashboard",
    hotkey: "app.messages",
    placement: "top",
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: ListTodo,
    to: "/tasks",
    hotkey: "app.tasks",
    placement: "top",
  },
  { id: "crm", label: "CRM", icon: Handshake, to: "/crm", hotkey: "app.crm", placement: "top" },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    to: "/agents",
    hotkey: "app.agents",
    placement: "top",
  },
  {
    id: "contacts",
    label: "Contacts",
    icon: Users,
    to: "/contacts",
    hotkey: "app.contacts",
    placement: "top",
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    to: "/notifications",
    hotkey: "app.notifications",
    placement: "bottom",
  },
] as const satisfies ReadonlyArray<WorkspaceApp>;

export type WorkspaceAppId = (typeof workspaceApps)[number]["id"];

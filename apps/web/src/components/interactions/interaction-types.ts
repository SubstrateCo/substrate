import type { InteractionKind } from "@substrate/contracts/context/interactions";

import type { getInteractionActivity, getInteractionTimeline } from "@/api/context/interactions";
import { Calendar, Mail, MessageSquare, Ellipsis, NotebookPen, Phone } from "lucide-react";

export type InteractionActivity = Awaited<ReturnType<typeof getInteractionActivity>>;
export type InteractionRow = Awaited<ReturnType<typeof getInteractionTimeline>>["items"][number];
export type InteractionSection =
  | "dashboard"
  | "timeline"
  | "people"
  | "accounts"
  | "person"
  | "account";

export const interactionKinds = ["email", "meeting", "call", "message", "note", "other"] as const;
export const interactionTypes = {
  email: {
    label: "Email",
    icon: Mail,
    color: "var(--chart-1)",
    textClass: "text-chart-1",
  },
  meeting: {
    label: "Meeting",
    icon: Calendar,
    color: "var(--chart-2)",
    textClass: "text-chart-2",
  },
  call: {
    label: "Call",
    icon: Phone,
    color: "var(--chart-3)",
    textClass: "text-chart-3",
  },
  message: {
    label: "Message",
    icon: MessageSquare,
    color: "var(--chart-4)",
    textClass: "text-chart-4",
  },
  note: {
    label: "Note",
    icon: NotebookPen,
    color: "var(--chart-5)",
    textClass: "text-chart-5",
  },
  other: {
    label: "Other",
    icon: Ellipsis,
    color: "var(--chart-6)",
    textClass: "text-chart-6",
  },
} satisfies Record<
  InteractionKind,
  { label: string; icon: typeof Mail; color: string; textClass: string }
>;

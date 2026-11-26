import type { InteractionSourceEvent } from "@substrate/contracts/calendar";
import type { InteractionKind } from "@substrate/contracts/context/interactions";

import type { getInteractionActivity, getInteractionTimeline } from "@/api/context/interactions";
import { Calendar, Mail, MessageSquare, Layers, NotebookPen, Phone } from "lucide-react";

export type InteractionActivity = Awaited<ReturnType<typeof getInteractionActivity>>;
export type InteractionRow = Awaited<ReturnType<typeof getInteractionTimeline>>["items"][number];
/** The meetings that calendar interactions came from, by interaction. */
export type InteractionSources = Readonly<Record<string, InteractionSourceEvent>>;
/** One shared empty value, so a table's column memo stays stable. */
export const emptySources: InteractionSources = {};
export type InteractionSection =
  | "dashboard"
  | "timeline"
  | "people"
  | "accounts"
  | "person"
  | "account";

/** How an interaction was recorded: a tag, a table cell, and the full wording for filters. */
export const interactionOrigins = {
  manual: { tag: "Manual", short: "Manual", long: "Logged manually" },
  message_publication: {
    tag: "Published from message",
    short: "Published",
    long: "Published from message",
  },
  calendar_event: { tag: "From meeting", short: "Meeting", long: "Recorded from meeting" },
} satisfies Record<InteractionRow["origin"], { tag: string; short: string; long: string }>;

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
    color: "var(--chart-5)",
    textClass: "text-chart-5",
  },
  note: {
    label: "Internal note",
    icon: NotebookPen,
    color: "var(--chart-4)",
    textClass: "text-chart-4",
  },
  other: {
    label: "Other",
    icon: Layers,
    color: "var(--chart-6)",
    textClass: "text-chart-6",
  },
} satisfies Record<
  InteractionKind,
  { label: string; icon: typeof Mail; color: string; textClass: string }
>;

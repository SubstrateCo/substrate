import type { InteractionFilterId } from "./interaction-filters";
import { interactionKinds, interactionOrigins, interactionTypes } from "./interaction-types";
import type { OptionFilterField } from "@/components/filters";
import { CalendarRange, Inbox, MessageSquare, Repeat, Target, UserRound } from "lucide-react";

type Field = OptionFilterField<InteractionFilterId>;

/** The required activity period. The dashboard has no all-time view. */
export function periodField({ allTime }: { allTime: boolean }): Field {
  return {
    id: "period",
    label: "Period",
    icon: CalendarRange,
    kind: "option",
    required: true,
    options: [
      { value: "7", label: "Last 7 days" },
      { value: "30", label: "Last 30 days" },
      ...(allTime ? [{ value: "all", label: "All time" }] : []),
    ],
  };
}

/** Whose interactions the dashboard counts. */
export const loggedByField: Field = {
  id: "loggedBy",
  label: "Logged by",
  icon: UserRound,
  kind: "option",
  required: true,
  options: [
    { value: "me", label: "Me" },
    { value: "anyone", label: "Anyone" },
  ],
};

export const typeField: Field = {
  id: "type",
  label: "Type",
  icon: MessageSquare,
  kind: "option",
  options: interactionKinds.map((kind) => {
    const { label, icon: Icon } = interactionTypes[kind];
    return { value: kind, label, icon: <Icon aria-hidden="true" /> };
  }),
};

/** How interactions were recorded. Meetings are a source only while the calendar app is on. */
export function originField({ calendar }: { calendar: boolean }): Field {
  return {
    id: "origin",
    label: "Origin",
    icon: Inbox,
    kind: "option",
    options: [
      { value: "manual", label: interactionOrigins.manual.long },
      { value: "message_publication", label: interactionOrigins.message_publication.long },
      ...(calendar
        ? [{ value: "calendar_event", label: interactionOrigins.calendar_event.long }]
        : []),
    ],
  };
}

export const frequencyField: Field = {
  id: "frequency",
  label: "Frequency",
  icon: Repeat,
  kind: "option",
  options: [{ value: "repeat", label: "2+ interactions" }],
};

/** Which of an organization's interactions count: its contacts' or only those linked to it. */
export const scopeField: Field = {
  id: "scope",
  label: "Scope",
  icon: Target,
  kind: "option",
  required: true,
  options: [
    { value: "related", label: "Related contacts" },
    { value: "linked", label: "Explicit links" },
  ],
};

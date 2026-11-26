import { Icon } from "@/components/ui/icon";
import {
  formatDateTime,
  interactionKindLabels,
  type InteractionKind,
} from "@/features/records/format";
import { Row } from "@/features/records/ui/rows";
import { FileText, Mail, MessageSquare, MoreHorizontal, Phone, Users } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

export const interactionIcons: Record<InteractionKind, LucideIcon> = {
  email: Mail,
  meeting: Users,
  call: Phone,
  message: MessageSquare,
  note: FileText,
  other: MoreHorizontal,
};

export const originLabels = {
  manual: "Logged by hand",
  message_publication: "Published from a message",
  calendar_event: "From a calendar event",
} as const;

export function durationLabel(occurredAt: string, endedAt: string | null) {
  if (!endedAt) return null;
  const minutes = Math.round((Date.parse(endedAt) - Date.parse(occurredAt)) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim()
    : `${minutes} min`;
}

export function InteractionRow({
  interaction,
  showContact,
  onPress,
}: {
  interaction: {
    kind: InteractionKind;
    summary: string;
    occurredAt: string;
    endedAt: string | null;
    contactName?: string;
    actor: { displayName: string };
  };
  showContact: boolean;
  onPress: () => void;
}) {
  const duration = durationLabel(interaction.occurredAt, interaction.endedAt);
  return (
    <Row
      title={interaction.summary.split("\n")[0] ?? interaction.summary}
      subtitle={[
        showContact ? interaction.contactName : interactionKindLabels[interaction.kind],
        formatDateTime(interaction.occurredAt),
        duration,
        interaction.actor.displayName,
      ]
        .filter(Boolean)
        .join(" · ")}
      leading={
        <Icon as={interactionIcons[interaction.kind]} className="size-4 text-muted-foreground" />
      }
      onPress={onPress}
      accessibilityLabel={`${interactionKindLabels[interaction.kind]}: ${interaction.summary}`}
    />
  );
}

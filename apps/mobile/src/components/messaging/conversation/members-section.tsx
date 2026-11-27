import { View } from "react-native";

import { AgentFace } from "../shared/agent-face";
import { SheetSection } from "../shared/panel-sheet";
import { PersonAvatar } from "../shared/person-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { Conversation, ConversationMember } from "@/features/messaging/types";
import { UserMinus } from "lucide-react-native";

/** Members grouped by organization, the viewer's first. */
export function MembersSection({
  conversation,
  viewerId,
  canRemove,
  onRemove,
  onProfile,
}: {
  conversation: Conversation;
  viewerId: string;
  canRemove: (member: ConversationMember) => boolean;
  onRemove: (member: ConversationMember) => void;
  onProfile: (member: ConversationMember) => void;
}) {
  const organizations = [...conversation.organizations].sort(
    (a, b) => Number(b.own) - Number(a.own),
  );
  return (
    <SheetSection title={`Members (${conversation.members.length})`}>
      {organizations.map((org) => {
        const members = conversation.members.filter((member) => member.organizationId === org.id);
        if (!members.length) return null;
        return (
          <View key={org.id}>
            {organizations.length > 1 ? (
              <Text className="pb-1 pt-3 text-xs text-muted-foreground">
                {org.own ? `${org.name} · Your organization` : org.name}
              </Text>
            ) : null}
            {members.map((member) => (
              <View key={member.actorId} className="min-h-12 flex-row items-center gap-3">
                <Button
                  variant="ghost"
                  className="min-w-0 flex-1 flex-row justify-start gap-3 px-0"
                  onPress={() => onProfile(member)}
                  accessibilityLabel={`Profile of ${member.name}`}
                >
                  {member.type === "agent" ? (
                    <AgentFace name={member.name} code={member.avatar} size="sm" />
                  ) : (
                    <PersonAvatar name={member.name} image={member.image} size="sm" />
                  )}
                  <Text className="shrink text-[15px] font-normal" numberOfLines={1}>
                    {member.userId === viewerId ? `${member.name} (you)` : member.name}
                  </Text>
                  {member.type === "agent" ? (
                    <Badge variant="outline">
                      <Text>Agent</Text>
                    </Badge>
                  ) : null}
                  {member.userId === conversation.createdBy && conversation.kind !== "dm" ? (
                    <Badge variant="secondary">
                      <Text>Owner</Text>
                    </Badge>
                  ) : null}
                </Button>
                {canRemove(member) ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    onPress={() => onRemove(member)}
                    accessibilityLabel={`Remove ${member.name}`}
                  >
                    <Icon as={UserMinus} className="size-4 text-destructive" />
                  </Button>
                ) : null}
              </View>
            ))}
          </View>
        );
      })}
    </SheetSection>
  );
}

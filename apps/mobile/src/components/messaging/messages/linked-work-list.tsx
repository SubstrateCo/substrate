import { View } from "react-native";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { LinkedWork } from "@/features/messaging/types";
import type { RecordTarget } from "@/lib/navigation";
import {
  Briefcase,
  Building2,
  CheckSquare,
  FolderKanban,
  Handshake,
  MessagesSquare,
  Unlink,
  User,
} from "lucide-react-native";

const icons = {
  task: CheckSquare,
  project: FolderKanban,
  contact: User,
  account: Building2,
  deal: Handshake,
  contact_interaction: MessagesSquare,
  meeting: Briefcase,
} as const;

/** Records linked to a message, with what the link means and an unlink action when allowed. */
export function LinkedWorkList({
  links,
  pending,
  targetFor,
  onOpen,
  onUnlink,
}: {
  links: LinkedWork[];
  pending: boolean;
  targetFor: (link: LinkedWork) => RecordTarget | undefined;
  onOpen: (target: RecordTarget) => void;
  onUnlink: (link: LinkedWork) => void;
}) {
  if (!links.length) return null;
  return (
    <View className="gap-1 pt-1">
      {links.map((link) => {
        const target = targetFor(link);
        const detail = [link.purpose === "source" ? "Created here" : "Linked", link.statusName]
          .filter(Boolean)
          .join(" · ");
        return (
          <View
            key={link.entityId}
            className="flex-row items-center rounded-md border border-border"
          >
            <Button
              variant="ghost"
              accessibilityRole={target ? "button" : undefined}
              accessibilityLabel={`${link.title}, ${detail}`}
              disabled={!target}
              onPress={() => target && onOpen(target)}
              className="min-h-12 flex-1 flex-row items-center justify-start gap-2 px-3 py-0 active:bg-accent"
            >
              <Icon as={icons[link.entityType]} className="size-4 text-muted-foreground" />
              <View className="min-w-0 flex-1">
                <Text className="text-sm" numberOfLines={1}>
                  {link.title}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {detail}
                </Text>
              </View>
            </Button>
            {link.canRemove ? (
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                onPress={() => onUnlink(link)}
                accessibilityLabel={`Unlink ${link.title}`}
              >
                <Icon as={Unlink} className="size-4 text-muted-foreground" />
              </Button>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useProfilePicture } from "@/features/messaging/queries/use-profile-picture";
import { cn } from "@/lib/utils";
import { Bot } from "lucide-react-native";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}

/**
 * A profile picture, with initials or an agent mark until it loads. `image` is the API's picture
 * path. Its bytes load through the authenticated byte route into a private local file, because an
 * image request to the path would follow its redirect to signed storage with the session attached.
 */
export function PersonAvatar({
  name,
  image,
  agent = false,
  size = "md",
}: {
  name: string;
  image?: string | null;
  agent?: boolean;
  size?: "sm" | "md";
}) {
  const uri = useProfilePicture(image);
  return (
    <Avatar alt={name} className={cn(size === "sm" ? "size-6" : "size-8", agent && "rounded-md")}>
      {uri ? <AvatarImage source={{ uri }} /> : null}
      <AvatarFallback className={cn(agent && "rounded-md")}>
        {agent ? (
          <Icon as={Bot} className="size-4 text-muted-foreground" />
        ) : (
          <Text
            className={cn(
              "font-medium text-muted-foreground",
              size === "sm" ? "text-[10px]" : "text-xs",
            )}
          >
            {initials(name)}
          </Text>
        )}
      </AvatarFallback>
    </Avatar>
  );
}

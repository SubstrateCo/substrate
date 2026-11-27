import { AVATAR_SIZES, type AvatarSize } from "./avatar-size";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Text } from "@/components/ui/text";
import { useProfilePicture } from "@/features/messaging/queries/use-profile-picture";
import { cn } from "@/lib/utils";

const INITIALS_TEXT: Record<AvatarSize, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-base",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")).toUpperCase() || "?";
}

/**
 * A person's profile picture, with initials until it loads. Agents use `AgentFace`. `image` is
 * the API's picture path. Its bytes load through the authenticated byte route into a private
 * local file, because an image request to the path would follow its redirect to signed storage
 * with the session attached.
 */
export function PersonAvatar({
  name,
  image,
  size = "md",
}: {
  name: string;
  image?: string | null;
  size?: AvatarSize;
}) {
  const uri = useProfilePicture(image);
  return (
    <Avatar alt={name} className={AVATAR_SIZES[size].box}>
      {uri ? <AvatarImage source={{ uri }} /> : null}
      <AvatarFallback>
        <Text className={cn("font-medium text-muted-foreground", INITIALS_TEXT[size])}>
          {initials(name)}
        </Text>
      </AvatarFallback>
    </Avatar>
  );
}

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/people/initials";
import { cn } from "cn";
import { Bot } from "lucide-react";

/** A small square avatar for people and agents in rows and chips: 24px, or 20px for `xs`. */
export function PersonAvatar({
  name,
  image,
  agent = false,
  size = "sm",
  className,
}: {
  name: string;
  image?: string | null;
  agent?: boolean;
  size?: "sm" | "xs";
  className?: string;
}) {
  return (
    <Avatar
      aria-hidden="true"
      variant="user"
      size="sm"
      className={cn(size === "xs" && "size-5", className)}
    >
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback>{agent ? <Bot className="size-3.5" /> : initials(name)}</AvatarFallback>
    </Avatar>
  );
}

import { AgentAvatar, decodeAvatarCode } from "@substrate/agent-avatars";
import type { AmbientLevel, Mood } from "@substrate/agent-avatars/config";
import type { AgentAvatarCode } from "@substrate/contracts/agents";

import { useMemo } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cva } from "class-variance-authority";
import { cn } from "cn";
import { Bot } from "lucide-react";

/**
 * Layout boxes in px. `xs` and `sm` match `PersonAvatar` in rows, chips, and pickers; `md`, `lg`,
 * and `xl` match the `Avatar` heads (`size-8`, a message author's `size-9`, a person card's
 * `size-10`); `2xl` is the preview in the agent's settings.
 */
const agentAvatarSizes = { xs: 20, sm: 24, md: 32, lg: 36, xl: 40, "2xl": 96 } as const;
export type AgentAvatarSize = keyof typeof agentAvatarSizes;

/**
 * The drawing keeps a margin around the body for motion, so its body spans about two thirds of
 * it. Drawing it this much larger, centred on the box, makes the body fill the box as a
 * person's circle does. The margin overflows the box and takes no layout space.
 */
const DRAWING_SCALE = 1.4;

const boxVariants = cva("", {
  variants: {
    size: {
      xs: "size-5",
      sm: "size-6",
      md: "size-8",
      lg: "size-9",
      xl: "size-10",
      "2xl": "size-24",
    },
  },
  defaultVariants: { size: "sm" },
});

/**
 * An agent's animated avatar, drawn from its stored code. It draws its own body, so do not
 * crop it or put it in a bordered circle. Rows stay calm: `xs` has no ambient motion and other
 * sizes only wink and glance, unless the caller asks for more. People use `PersonAvatar`.
 */
export function AgentAvatarView({
  avatar,
  mood,
  size = "sm",
  ambient = size === "xs" ? "off" : "subtle",
  animated = true,
  interactive = false,
  label,
  className,
}: {
  /** The stored look. Null, while it is not known, shows the Bot mark. */
  avatar: AgentAvatarCode | null;
  /** What the agent is doing, such as `working` during a live turn. Defaults to waiting. */
  mood?: Mood;
  size?: AgentAvatarSize;
  ambient?: AmbientLevel;
  /** `false` holds a still pose, such as in a choice tile. */
  animated?: boolean;
  /** Hovering gets its attention and a poke squashes it. For the agent's own page only. */
  interactive?: boolean;
  /** Accessible name. Without it the avatar is decorative. */
  label?: string;
  className?: string;
}) {
  const look = useMemo(() => (avatar ? decodeAvatarCode(avatar) : null), [avatar]);
  // A code this client cannot read, such as one from a newer version, also shows the Bot mark.
  if (!look)
    return (
      <Avatar
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        variant="agent"
        size="sm"
        className={cn(boxVariants({ size }), className)}
      >
        <AvatarFallback>
          <Bot aria-hidden="true" className="size-3.5 group-data-[size=default]/avatar:size-5" />
        </AvatarFallback>
      </Avatar>
    );
  return (
    <span
      data-slot="agent-avatar"
      className={cn("relative inline-block shrink-0", boxVariants({ size }), className)}
    >
      <AgentAvatar
        {...look}
        mood={mood}
        size={Math.round(agentAvatarSizes[size] * DRAWING_SCALE)}
        ambient={ambient}
        animated={animated}
        interactive={interactive}
        outline
        label={label}
        className="absolute top-1/2 left-1/2 -translate-1/2"
      />
    </span>
  );
}

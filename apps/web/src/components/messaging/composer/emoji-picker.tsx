import { useEffect, useRef, useState, type PointerEvent } from "react";

import { Button } from "../../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { SmilePlus } from "lucide-react";

const emojis = [
  "😀",
  "😊",
  "😂",
  "❤️",
  "👍",
  "👎",
  "🎉",
  "🚀",
  "👀",
  "✅",
  "🙏",
  "🔥",
  "💡",
  "🙌",
  "💯",
  "🤔",
  "😅",
  "😢",
  "👋",
  "✨",
  "💪",
  "☕",
  "🛠️",
  "📌",
];

// Grace period that lets the pointer cross the gap between the button and the picker.
const closeDelay = 200;

export function EmojiPicker({
  onSelect,
  disabled = false,
  label = "Add emoji",
}: {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openedByHover = useRef(false);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), closeDelay);
  };
  useEffect(() => cancelClose, []);
  const hover = {
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || disabled) return;
      cancelClose();
      if (!open) {
        openedByHover.current = true;
        setOpen(true);
      }
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === "mouse") scheduleClose();
    },
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        cancelClose();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          {...hover}
          onClick={(event) => {
            // A click on a hover-opened picker keeps it open instead of toggling it closed.
            event.preventDefault();
            cancelClose();
            openedByHover.current = false;
            setOpen(true);
          }}
        >
          <SmilePlus className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64"
        align="start"
        {...hover}
        onOpenAutoFocus={(event) => {
          // Hovering must not take focus away from the message being typed.
          if (openedByHover.current) event.preventDefault();
        }}
      >
        <p className="mb-2 text-xs font-medium text-muted-foreground">Pick an emoji</p>
        <div className="grid grid-cols-6 gap-1">
          {emojis.map((emoji) => (
            <Button
              key={emoji}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={emoji}
              onClick={() => {
                onSelect(emoji);
                cancelClose();
                setOpen(false);
              }}
            >
              {emoji}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

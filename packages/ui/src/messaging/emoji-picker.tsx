import { SmilePlus } from "lucide-react";
import { useState } from "react";
import { Button } from "../primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "../primitives/popover";

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
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          title={label}
          disabled={disabled}
        >
          <SmilePlus className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
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

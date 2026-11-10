import { useRef, useState } from "react";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { emojiCategories, recentEmojis, rememberEmoji, type Emoji } from "./emoji-data";
import { SmilePlus } from "lucide-react";

function EmojiGrid({
  label,
  emojis,
  onPick,
}: {
  label: string;
  emojis: Emoji[];
  onPick: (emoji: string) => void;
}) {
  return (
    <section aria-label={label} className="space-y-1">
      <h4 className="px-1 text-xs font-medium text-muted-foreground">{label}</h4>
      <div className="grid grid-cols-8 gap-0.5">
        {emojis.map(({ emoji, name }) => (
          <Button
            key={emoji}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={name}
            title={name}
            onClick={() => onPick(emoji)}
          >
            <span className="text-lg leading-none">{emoji}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}

/** Opens on click. Search matches emoji names; recent picks come first. */
export function EmojiPicker({
  onSelect,
  disabled = false,
  label = "Add emoji",
  size = "icon-sm",
}: {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
  label?: string;
  size?: "icon-xs" | "icon-sm";
}) {
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<Emoji[]>([]);
  const search = query.trim().toLowerCase();
  const matches = search
    ? emojiCategories
        .flatMap((category) => category.emojis)
        .filter((item) => item.name.includes(search))
    : [];
  const pick = (emoji: string) => {
    rememberEmoji(emoji);
    onSelect(emoji);
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery("");
          setRecent(recentEmojis());
        }
        setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size={size}
              aria-label={label}
              disabled={disabled}
            >
              <SmilePlus />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        variant="reference"
        className="w-80"
        align="start"
        aria-label="Emoji"
        ref={content}
        onCloseAutoFocus={(event) => {
          // After a pick, keep focus where the consumer put it, such as back in the composer.
          const active = document.activeElement;
          if (active && active !== document.body && !content.current?.contains(active))
            event.preventDefault();
        }}
      >
        <div className="border-b p-2">
          <Input
            type="search"
            aria-label="Search emoji"
            placeholder="Search emoji"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                pick(matches[0].emoji);
              }
            }}
          />
        </div>
        <div className="max-h-72 space-y-3 overflow-y-auto p-2">
          {search && matches.length > 0 && (
            <EmojiGrid label="Results" emojis={matches} onPick={pick} />
          )}
          {search && matches.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No emoji match “{query.trim()}”
            </p>
          )}
          {!search && recent.length > 0 && (
            <EmojiGrid label="Recent" emojis={recent} onPick={pick} />
          )}
          {!search &&
            emojiCategories.map((category) => (
              <EmojiGrid
                key={category.name}
                label={category.name}
                emojis={category.emojis}
                onPick={pick}
              />
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

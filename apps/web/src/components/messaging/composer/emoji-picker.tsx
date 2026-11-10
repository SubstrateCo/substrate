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
  offset,
  active,
  onFocus,
}: {
  label: string;
  emojis: Emoji[];
  onPick: (emoji: string) => void;
  offset: number;
  active: number;
  onFocus: (index: number) => void;
}) {
  return (
    <section aria-label={label} className="space-y-1">
      <h4 className="px-1 text-xs font-medium text-muted-foreground">{label}</h4>
      <div className="grid grid-cols-8 gap-0.5">
        {emojis.map(({ emoji, name }, index) => (
          <Button
            key={emoji}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={name}
            title={name}
            tabIndex={active === offset + index ? 0 : -1}
            data-emoji-option=""
            onFocus={() => onFocus(offset + index)}
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
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
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
  let groups = [...(recent.length ? [{ name: "Recent", emojis: recent }] : []), ...emojiCategories];
  if (search) groups = matches.length ? [{ name: "Results", emojis: matches }] : [];
  let offset = 0;
  const focusOption = (index: number) => {
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>("[data-emoji-option]");
    if (!buttons?.length) return;
    const next = Math.max(0, Math.min(index, buttons.length - 1));
    setActive(next);
    buttons[next]?.focus();
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery("");
          setActive(0);
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
        collisionPadding={8}
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
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusOption(0);
              }
              if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                pick(matches[0].emoji);
              }
            }}
          />
        </div>
        <div
          ref={list}
          className={`${search ? "max-h-72" : "h-72 max-h-(--radix-popover-content-available-height)"} space-y-3 overflow-y-auto p-2`}
          onKeyDown={(event) => {
            const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 }[event.key];
            if (delta !== undefined) {
              event.preventDefault();
              focusOption(active + delta);
            }
          }}
        >
          {search && matches.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No emoji match “{query.trim()}”
            </p>
          )}
          {groups.map((category) => {
            const groupOffset = offset;
            offset += category.emojis.length;
            return (
              <EmojiGrid
                key={category.name}
                label={category.name}
                emojis={category.emojis}
                onPick={pick}
                offset={groupOffset}
                active={active}
                onFocus={setActive}
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

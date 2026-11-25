import { useMemo, useRef, useState, type ReactNode } from "react";

import { emojiCategories, recentEmojis, rememberEmoji, type Emoji } from "./emoji-data";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SmilePlus } from "lucide-react";

const columns = 8;
const allEmojis = emojiCategories.flatMap((category) => category.emojis);

/**
 * Plain buttons with no tooltip each: the panel's footer names the emoji under the pointer or
 * focus, so opening the picker mounts no per-emoji popper.
 */
function EmojiGrid({
  label,
  emojis,
  onPick,
  onPreview,
  offset,
  active,
  onFocus,
}: {
  label: string;
  emojis: Emoji[];
  onPick: (emoji: string) => void;
  onPreview: (emoji: Emoji) => void;
  offset: number;
  active: number;
  onFocus: (index: number) => void;
}) {
  return (
    <section aria-label={label} className="space-y-1">
      <Heading level={4} variant="label" className="px-1">
        {label}
      </Heading>
      <div className="grid grid-cols-8 gap-0.5">
        {emojis.map((item, index) => (
          <Button
            key={item.emoji}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={item.name}
            tabIndex={active === offset + index ? 0 : -1}
            data-emoji-option=""
            onPointerEnter={() => onPreview(item)}
            onFocus={() => {
              onFocus(offset + index);
              onPreview(item);
            }}
            onClick={() => onPick(item.emoji)}
          >
            <span className="text-lg leading-none">{item.emoji}</span>
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
  size?: "icon-xs" | "icon-sm" | "icon";
}) {
  return (
    <EmojiPopover
      label={label}
      onSelect={(emoji) => {
        rememberEmoji(emoji);
        onSelect(emoji);
      }}
    >
      <Button type="button" variant="ghost" size={size} aria-label={label} disabled={disabled}>
        <SmilePlus />
      </Button>
    </EmojiPopover>
  );
}

/**
 * The emoji panel in a popover around any trigger. `children` is the trigger button; it gets a
 * tooltip with `label`.
 */
export function EmojiPopover({
  label,
  onSelect,
  children,
}: {
  label: string;
  onSelect: (emoji: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        {/* The popover trigger is outermost so its open state wins the trigger's data-state,
            which keeps the message toolbar visible while the panel is open. */}
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
        </PopoverTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <PopoverContent
        variant="reference"
        className="max-h-(--radix-popover-content-available-height) w-80"
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
        <EmojiPanel
          onPick={(emoji) => {
            onSelect(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** The popover's content. It mounts on each open, so search and recent picks start fresh. */
function EmojiPanel({ onPick: pick }: { onPick: (emoji: string) => void }) {
  const [query, setQuery] = useState("");
  const [recent] = useState(recentEmojis);
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState<Emoji | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = query.trim().toLowerCase();
  const matches = useMemo(
    () => (search ? allEmojis.filter((item) => item.name.includes(search)) : []),
    [search],
  );
  let groups = [...(recent.length ? [{ name: "Recent", emojis: recent }] : []), ...emojiCategories];
  if (search) groups = matches.length ? [{ name: "Results", emojis: matches }] : [];
  const shown = preview ?? (search ? matches[0] : undefined);
  let offset = 0;
  const focusOption = (index: number) => {
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>("[data-emoji-option]");
    if (!buttons?.length) return;
    const next = Math.max(0, Math.min(index, buttons.length - 1));
    setActive(next);
    buttons[next]?.focus();
  };
  return (
    <>
      <div className="shrink-0 border-b p-2">
        <Input
          type="search"
          aria-label="Search emoji"
          placeholder="Search emoji"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setPreview(null);
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
        className={`${search ? "max-h-72" : "h-72"} min-h-0 space-y-3 overflow-y-auto p-2`}
        onKeyDown={(event) => {
          const delta = {
            ArrowLeft: -1,
            ArrowRight: 1,
            ArrowUp: -columns,
            ArrowDown: columns,
          }[event.key];
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
              onPreview={setPreview}
              offset={groupOffset}
              active={active}
              onFocus={setActive}
            />
          );
        })}
      </div>
      <div aria-hidden="true" className="flex h-12 shrink-0 items-center gap-2 border-t px-3">
        {shown ? (
          <>
            <span className="text-2xl leading-none">{shown.emoji}</span>
            <span className="truncate text-sm">{shown.name}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Pick an emoji</span>
        )}
      </div>
    </>
  );
}

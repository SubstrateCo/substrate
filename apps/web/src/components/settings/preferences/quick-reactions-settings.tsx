import { SettingsSection, SettingsRow } from "@/components/layout/settings-section";
import { EmojiPopover } from "@/components/messaging/composer/emoji-picker";
import {
  defaultQuickReactions,
  replaceQuickReaction,
  setQuickReactions,
  useQuickReactions,
} from "@/components/messaging/composer/quick-reactions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RotateCcw } from "lucide-react";

export function QuickReactionsSettings() {
  const quickReactions = useQuickReactions();
  const emojis = quickReactions.map((item) => item.emoji);
  const isDefault = emojis.join() === defaultQuickReactions.join();
  return (
    <SettingsSection title="Messages">
      <SettingsRow
        label="Quick reactions"
        description="Shown first when you point at a message. Select one to replace it."
        control={
          <div role="group" aria-label="Quick reactions" className="flex items-center gap-2">
            {quickReactions.map(({ emoji, name }, slot) => (
              <EmojiPopover
                // Keyed by slot, so focus returns to the same button after a replacement.
                // oxlint-disable-next-line react/no-array-index-key -- Slots are fixed positions.
                key={slot}
                label={`Replace ${name}`}
                onSelect={(next) => setQuickReactions(replaceQuickReaction(emojis, slot, next))}
              >
                <Button type="button" variant="outline" size="icon" aria-label={`Replace ${name}`}>
                  <span aria-hidden="true" className="text-lg leading-none">
                    {emoji}
                  </span>
                </Button>
              </EmojiPopover>
            ))}
            {!isDefault && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Reset quick reactions"
                    onClick={() => setQuickReactions([...defaultQuickReactions])}
                  >
                    <RotateCcw aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset quick reactions</TooltipContent>
              </Tooltip>
            )}
          </div>
        }
      />
    </SettingsSection>
  );
}

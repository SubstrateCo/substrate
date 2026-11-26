import { emojiCategories, type Emoji } from "@substrate/contracts/messaging/emoji";

import { z } from "zod";

const emojiByCharacter = new Map(
  emojiCategories.flatMap((category) => category.emojis).map((item) => [item.emoji, item]),
);

/** The named catalog entry for an emoji, or undefined when it is not in the picker. */
export function findEmoji(emoji: string): Emoji | undefined {
  return emojiByCharacter.get(emoji);
}

const recentKey = "substrate:recent-emojis";
const recentLimit = 8;

const storedRecents = z.array(z.string()).catch([]);

export function recentEmojis(): Emoji[] {
  try {
    const stored = storedRecents.parse(JSON.parse(localStorage.getItem(recentKey) ?? "[]"));
    const known = new Map(
      emojiCategories.flatMap((category) => category.emojis).map((item) => [item.emoji, item]),
    );
    return stored.flatMap((emoji) => {
      const item = known.get(emoji);
      return item ? [item] : [];
    });
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string) {
  try {
    const next = [emoji, ...recentEmojis().map((item) => item.emoji)].filter(
      (item, index, all) => all.indexOf(item) === index,
    );
    localStorage.setItem(recentKey, JSON.stringify(next.slice(0, recentLimit)));
  } catch {
    // Recents are a convenience; a blocked storage keeps the picker working.
  }
}

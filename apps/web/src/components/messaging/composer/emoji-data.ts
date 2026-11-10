import { z } from "zod";

export type Emoji = { emoji: string; name: string };

/** A curated set with names for search and screen readers. */
export const emojiCategories: { name: string; emojis: Emoji[] }[] = [
  {
    name: "Reactions",
    emojis: [
      { emoji: "👍", name: "thumbs up" },
      { emoji: "👎", name: "thumbs down" },
      { emoji: "❤️", name: "red heart" },
      { emoji: "🎉", name: "party popper" },
      { emoji: "🙌", name: "raising hands" },
      { emoji: "👏", name: "clapping hands" },
      { emoji: "🙏", name: "folded hands thanks" },
      { emoji: "👀", name: "eyes looking" },
      { emoji: "✅", name: "check mark done" },
      { emoji: "❌", name: "cross mark no" },
      { emoji: "🔥", name: "fire" },
      { emoji: "💯", name: "hundred points" },
      { emoji: "🚀", name: "rocket ship launch" },
      { emoji: "✨", name: "sparkles" },
      { emoji: "💪", name: "flexed biceps strong" },
      { emoji: "👋", name: "waving hand hello" },
    ],
  },
  {
    name: "Smileys",
    emojis: [
      { emoji: "😀", name: "grinning face" },
      { emoji: "😄", name: "grinning face with smiling eyes" },
      { emoji: "😂", name: "face with tears of joy laugh" },
      { emoji: "🤣", name: "rolling on the floor laughing" },
      { emoji: "😊", name: "smiling face" },
      { emoji: "🙂", name: "slightly smiling face" },
      { emoji: "😉", name: "winking face" },
      { emoji: "😍", name: "heart eyes" },
      { emoji: "🥳", name: "partying face" },
      { emoji: "😎", name: "smiling face with sunglasses cool" },
      { emoji: "🤔", name: "thinking face" },
      { emoji: "🤯", name: "exploding head mind blown" },
      { emoji: "😅", name: "grinning face with sweat" },
      { emoji: "😬", name: "grimacing face" },
      { emoji: "🙃", name: "upside down face" },
      { emoji: "😐", name: "neutral face" },
      { emoji: "😴", name: "sleeping face" },
      { emoji: "😢", name: "crying face sad" },
      { emoji: "😭", name: "loudly crying face" },
      { emoji: "😮", name: "face with open mouth surprised" },
      { emoji: "😱", name: "face screaming in fear" },
      { emoji: "😤", name: "face with steam" },
      { emoji: "🫡", name: "saluting face" },
      { emoji: "🤝", name: "handshake deal" },
    ],
  },
  {
    name: "Work",
    emojis: [
      { emoji: "💡", name: "light bulb idea" },
      { emoji: "📌", name: "pushpin pin" },
      { emoji: "📎", name: "paperclip attachment" },
      { emoji: "📝", name: "memo note" },
      { emoji: "📅", name: "calendar date" },
      { emoji: "⏰", name: "alarm clock deadline" },
      { emoji: "📈", name: "chart increasing growth" },
      { emoji: "📉", name: "chart decreasing" },
      { emoji: "📊", name: "bar chart" },
      { emoji: "🛠️", name: "hammer and wrench tools" },
      { emoji: "🐛", name: "bug" },
      { emoji: "🧪", name: "test tube experiment" },
      { emoji: "🔒", name: "locked" },
      { emoji: "🔑", name: "key" },
      { emoji: "📣", name: "megaphone announcement" },
      { emoji: "💬", name: "speech balloon comment" },
      { emoji: "📦", name: "package ship" },
      { emoji: "🧭", name: "compass direction" },
      { emoji: "🎯", name: "bullseye target goal" },
      { emoji: "🏁", name: "chequered flag finish" },
      { emoji: "☕", name: "hot beverage coffee" },
      { emoji: "🍕", name: "pizza" },
      { emoji: "🌟", name: "glowing star" },
      { emoji: "🏆", name: "trophy win" },
    ],
  },
  {
    name: "Symbols",
    emojis: [
      { emoji: "⚠️", name: "warning" },
      { emoji: "❗", name: "exclamation mark" },
      { emoji: "❓", name: "question mark" },
      { emoji: "➕", name: "plus" },
      { emoji: "➖", name: "minus" },
      { emoji: "🔁", name: "repeat" },
      { emoji: "⏳", name: "hourglass waiting" },
      { emoji: "🟢", name: "green circle" },
      { emoji: "🟡", name: "yellow circle" },
      { emoji: "🔴", name: "red circle" },
      { emoji: "⭐", name: "star" },
      { emoji: "💥", name: "collision boom" },
    ],
  },
];

const recentKey = "startup-os:recent-emojis";
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

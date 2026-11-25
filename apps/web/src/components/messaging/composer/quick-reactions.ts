import { useSyncExternalStore } from "react";

import { findEmoji, type Emoji } from "./emoji-data";
import { z } from "zod";

/** Quick reactions are a device preference, like the theme, so they stay in localStorage. */
const storageKey = "substrate:quick-reactions";

const quickReactionCount = 3;
export const defaultQuickReactions = ["😂", "👍", "🙌"] as const;

const stored = z.array(z.string()).catch([]);

/**
 * Reads a stored list. Unknown or repeated emoji fall back to the defaults slot by slot, so a
 * partly broken value keeps the user's valid picks.
 */
export function parseQuickReactions(raw: string | null): string[] {
  let values: string[] = [];
  try {
    values = stored.parse(JSON.parse(raw ?? "[]"));
  } catch {
    values = [];
  }
  const picked: string[] = [];
  for (let slot = 0; slot < quickReactionCount; slot++) {
    const value = values[slot];
    if (value && findEmoji(value) && !picked.includes(value)) picked.push(value);
    else picked.push("");
  }
  const spare = defaultQuickReactions.filter((emoji) => !picked.includes(emoji));
  return picked.map((emoji) => emoji || spare.shift()!);
}

/** Puts `emoji` in `slot`. If it is already in another slot, the two slots swap. */
export function replaceQuickReaction(current: string[], slot: number, emoji: string): string[] {
  const next = [...current];
  const existing = next.indexOf(emoji);
  if (existing !== -1) next[existing] = next[slot]!;
  next[slot] = emoji;
  return next;
}

function read() {
  try {
    return parseQuickReactions(localStorage.getItem(storageKey));
  } catch {
    return [...defaultQuickReactions];
  }
}

let snapshot = read();
const listeners = new Set<() => void>();

function publish(next: string[]) {
  if (next.join() === snapshot.join()) return;
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === storageKey || event.key === null) publish(read());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setQuickReactions(next: string[]) {
  const valid = parseQuickReactions(JSON.stringify(next));
  try {
    if (valid.join() === defaultQuickReactions.join()) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, JSON.stringify(valid));
  } catch {
    // Keep the in-memory choice if persistence is blocked.
  }
  publish(valid);
}

/** The three emoji shown in the message toolbar, with their names. */
export function useQuickReactions(): Emoji[] {
  const emojis = useSyncExternalStore(subscribe, () => snapshot);
  return emojis.map((emoji) => findEmoji(emoji)!);
}

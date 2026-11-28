import type { Emoji } from "@substrate/contracts/messaging/emoji";

import { useSyncExternalStore } from "react";

import { findEmoji } from "./emoji-data";
import { z } from "zod";

const storageKey = "substrate:quick-reactions";

const quickReactionCount = 3;
export const defaultQuickReactions = ["😂", "👍", "🙌"] as const;

const stored = z.array(z.string()).catch([]);

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
  } catch {}
  publish(valid);
}

export function useQuickReactions(): Emoji[] {
  const emojis = useSyncExternalStore(subscribe, () => snapshot);
  return emojis.map((emoji) => findEmoji(emoji)!);
}

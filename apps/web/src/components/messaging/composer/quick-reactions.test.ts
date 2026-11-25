import {
  defaultQuickReactions,
  parseQuickReactions,
  replaceQuickReaction,
} from "./quick-reactions";
import { expect, test } from "bun:test";

test("stored quick reactions keep valid picks and fill bad slots with unused defaults", () => {
  expect(parseQuickReactions(null)).toEqual([...defaultQuickReactions]);
  expect(parseQuickReactions("not json")).toEqual([...defaultQuickReactions]);
  expect(parseQuickReactions(JSON.stringify(["🔥", "👀", "🚀"]))).toEqual(["🔥", "👀", "🚀"]);
  // An unknown emoji and a repeat are replaced by defaults that are not already picked.
  expect(parseQuickReactions(JSON.stringify(["👍", "🦄", "👍"]))).toEqual(["👍", "😂", "🙌"]);
  expect(parseQuickReactions(JSON.stringify(["🔥"]))).toEqual(["🔥", "😂", "👍"]);
});

test("choosing an emoji that is already a quick reaction swaps the two slots", () => {
  expect(replaceQuickReaction(["😂", "👍", "🙌"], 0, "🔥")).toEqual(["🔥", "👍", "🙌"]);
  expect(replaceQuickReaction(["😂", "👍", "🙌"], 0, "🙌")).toEqual(["🙌", "👍", "😂"]);
});

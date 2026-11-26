import { narrowedSuggestions } from "./reference-suggestions";
import { expect, test } from "bun:test";

const rows = [
  { kind: "person", title: "Alex Smith" },
  { kind: "task", title: "Review Alex launch plan" },
  { kind: "person", title: "Sam Lee" },
];

test("keeps only earlier rows whose title still contains the text, in their order", () => {
  expect(narrowedSuggestions(rows, ["person", "task"], " ALEX ")).toEqual([rows[0]!, rows[1]!]);
});

test("drops rows of kinds the current tab does not show", () => {
  expect(narrowedSuggestions(rows, ["person"], "alex")).toEqual([rows[0]!]);
});

test("gives nothing to narrow before the first search returns", () => {
  expect(narrowedSuggestions(undefined, ["person"], "alex")).toBeUndefined();
});

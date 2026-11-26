import { removeDealContact, selectDealPrimary } from "./deal-contacts";
import { expect, test } from "bun:test";

test("removing a secondary contact preserves the primary and remaining participants", () => {
  expect(removeDealContact({ ids: ["a", "b", "c"], primary: "a" }, "b")).toEqual({
    ids: ["a", "c"],
    primary: "a",
  });
});

test("removing the primary clears it without choosing a different person", () => {
  expect(removeDealContact({ ids: ["a", "b"], primary: "a" }, "a")).toEqual({
    ids: ["b"],
    primary: null,
  });
});

test("choosing a primary adds that participant once; clearing primary preserves participants", () => {
  expect(selectDealPrimary({ ids: ["a"], primary: "a" }, "b")).toEqual({
    ids: ["a", "b"],
    primary: "b",
  });
  expect(selectDealPrimary({ ids: ["a", "b"], primary: "a" }, "b").ids).toEqual(["a", "b"]);
  expect(selectDealPrimary({ ids: ["a", "b"], primary: "a" }, null)).toEqual({
    ids: ["a", "b"],
    primary: null,
  });
});

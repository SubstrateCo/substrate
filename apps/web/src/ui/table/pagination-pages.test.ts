import { paginationPages } from "./pagination-pages";
import { expect, test } from "bun:test";

test("small tables show all available page links", () => {
  expect(paginationPages(0, 0)).toEqual([]);
  expect(paginationPages(0, 3)).toEqual([0, 1, 2]);
});

test("large tables keep page links bounded with current, first, and last pages", () => {
  expect(paginationPages(0, 100_000)).toEqual([0, 1, 2, 3, 99_999]);
  expect(paginationPages(50, 100_000)).toEqual([0, 49, 50, 51, 99_999]);
  expect(paginationPages(99_999, 100_000)).toEqual([0, 99_996, 99_997, 99_998, 99_999]);
});

import { debouncedSearch } from "./use-search-debounce";
import { expect, test } from "bun:test";

test("a search is pending and empty until its first query settles", () => {
  expect(debouncedSearch(null, "rel", "org-1")).toEqual({ query: "", pending: true });
});

test("a settled query is used, and newer typing keeps it while the next query is pending", () => {
  const settled = { query: "release", scope: "org-1" };
  expect(debouncedSearch(settled, "release", "org-1")).toEqual({
    query: "release",
    pending: false,
  });
  expect(debouncedSearch(settled, "release notes", "org-1")).toEqual({
    query: "release",
    pending: true,
  });
});

test("a scope change hides the previous results at once instead of reusing them", () => {
  const settled = { query: "release", scope: "org-1" };
  expect(debouncedSearch(settled, "release", "org-2")).toEqual({ query: "", pending: true });
});

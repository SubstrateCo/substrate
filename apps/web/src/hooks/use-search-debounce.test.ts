import { debouncedSearch } from "./use-search-debounce";
import { expect, test } from "bun:test";

test("a pending search uses the current text so it detaches from an obsolete query key", () => {
  expect(debouncedSearch(null, "rel", "org-1")).toEqual({ query: "rel", pending: true });
});

test("newer typing changes the query key before the next query settles", () => {
  const settled = { query: "release", scope: "org-1" };
  expect(debouncedSearch(settled, "release", "org-1")).toEqual({
    query: "release",
    pending: false,
  });
  expect(debouncedSearch(settled, "release notes", "org-1")).toEqual({
    query: "release notes",
    pending: true,
  });
});

test("a scope change keeps searching disabled until the current scope settles", () => {
  const settled = { query: "release", scope: "org-1" };
  expect(debouncedSearch(settled, "release", "org-2")).toEqual({ query: "release", pending: true });
});

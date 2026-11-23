import { GoogleUnavailable } from "./errors";
import { googlePages, type GooglePage } from "./paging";
import { expect, test } from "bun:test";

type Page = GooglePage & { items: string[] };

function pages(fixtures: Page[], options?: { maxPages?: number }) {
  const tokens: (string | undefined)[] = [];
  const iterable = googlePages(async (pageToken) => {
    tokens.push(pageToken);
    const page = fixtures.shift();
    if (!page) throw new Error("No more fixture pages.");
    return page;
  }, options);
  return { iterable, tokens };
}

async function items(iterable: AsyncIterable<Page>) {
  const seen: string[] = [];
  for await (const page of iterable) seen.push(...page.items);
  return seen;
}

test("pages follow nextPageToken and end with the last page's sync token", async () => {
  const { iterable, tokens } = pages([
    { items: ["a"], nextPageToken: "p2" },
    { items: ["b"], nextPageToken: "p3", nextSyncToken: "ignored" },
    { items: ["c"], nextSyncToken: "sync-1" },
  ]);
  expect(iterable.nextSyncToken).toBeNull();
  expect(await items(iterable)).toEqual(["a", "b", "c"]);
  expect(tokens).toEqual([undefined, "p2", "p3"]);
  expect(iterable.nextSyncToken).toBe("sync-1");
});

test("a list without a sync token ends with none", async () => {
  const { iterable } = pages([{ items: ["a"] }]);
  expect(await items(iterable)).toEqual(["a"]);
  expect(iterable.nextSyncToken).toBeNull();
});

test("a list that never ends stops at the page limit", async () => {
  const { iterable, tokens } = pages(
    Array.from({ length: 5 }, (_, index) => ({ items: [], nextPageToken: `p${index}` })),
    { maxPages: 3 },
  );
  let error: unknown;
  try {
    await items(iterable);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(GoogleUnavailable);
  expect(error).toMatchObject({ errorCode: "provider_paging" });
  expect(tokens).toHaveLength(3);
});

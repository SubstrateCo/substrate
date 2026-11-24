import { QueryClient } from "@tanstack/react-query";

import { keepPageWhileTurning } from "./page-turn";
import { expect, test } from "bun:test";

test("a page turn keeps the current page, and a new filter does not", () => {
  const client = new QueryClient();
  const cache = client.getQueryCache();
  const page = ["org", "crm", "deals", "list", "", false, ""];
  client.setQueryData(page, ["deal"]);
  const previous = cache.find<string[]>({ queryKey: page, exact: true });
  const turn = keepPageWhileTurning<string[]>(["org", "crm", "deals", "list", "", false, "d1"]);
  expect(turn(["deal"], previous)).toEqual(["deal"]);
  const archived = keepPageWhileTurning<string[]>(["org", "crm", "deals", "list", "", true, ""]);
  expect(archived(["deal"], previous)).toBeUndefined();
});

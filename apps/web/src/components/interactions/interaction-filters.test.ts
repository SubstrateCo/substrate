import { interactionFiltersFrom, interactionFilterValue } from "./interaction-filters";
import { describe, expect, test } from "bun:test";

const is = (value: string) => ({ operator: "is" as const, values: [value] });

describe("interactionFilterValue", () => {
  test("shows the period and scope, and omits unset optional filters", () => {
    expect(interactionFilterValue({ days: "7", scope: "linked", repeat: false })).toEqual({
      period: is("7"),
      scope: is("linked"),
    });
  });

  test("maps 2+ interactions to the frequency filter", () => {
    expect(interactionFilterValue({ days: "all", repeat: true }).frequency).toEqual(is("repeat"));
  });
});

describe("interactionFiltersFrom", () => {
  test("reads each clause back into the filters", () => {
    const filters = {
      days: "30",
      kind: "call",
      origin: "calendar_event",
      repeat: true,
      scope: "linked",
    } as const;
    expect(interactionFiltersFrom(interactionFilterValue(filters), { days: "7" })).toEqual(filters);
  });

  test("keeps the current required choices when their clauses are missing", () => {
    expect(interactionFiltersFrom({}, { days: "all", scope: "related" })).toEqual({
      days: "all",
      kind: undefined,
      origin: undefined,
      repeat: false,
      scope: "related",
    });
  });

  test("reads the logged-by choice and keeps the current one when its clause is missing", () => {
    const current = { days: "30", loggedBy: "me" } as const;
    expect(interactionFiltersFrom({ loggedBy: is("anyone") }, current).loggedBy).toBe("anyone");
    expect(interactionFiltersFrom({ loggedBy: is("someone") }, current).loggedBy).toBe("me");
    expect(interactionFiltersFrom({}, current).loggedBy).toBe("me");
  });

  test("drops values the data layer does not support", () => {
    const filters = interactionFiltersFrom(
      { period: is("90"), type: is("fax"), origin: is("import"), scope: is("everyone") },
      { days: "30", scope: "related" },
    );
    expect(filters).toMatchObject({
      days: "30",
      kind: undefined,
      origin: undefined,
      scope: "related",
    });
  });
});

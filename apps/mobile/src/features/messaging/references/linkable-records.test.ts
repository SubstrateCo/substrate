import { settleLinks } from "./linkable-records";
import { expect, test } from "bun:test";

test("a partial link failure keeps the successful links and reports each failed record", () => {
  const denied = new Error("You no longer have edit access.");
  const result = settleLinks(
    ["task", "deal", "contact"],
    [
      { status: "fulfilled", value: null },
      { status: "rejected", reason: denied },
      { status: "rejected", reason: "offline" },
    ],
  );
  expect(result.linked).toEqual(["task"]);
  expect(result.failed.map(({ item }) => item)).toEqual(["deal", "contact"]);
  expect(result.failed[0]!.error).toBe(denied);
  expect(result.failed[1]!.error.message).toBe("offline");
});

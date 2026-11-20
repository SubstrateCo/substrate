import { realtimeKeys } from "./index";
import { expect, test } from "bun:test";

test("audience keys preserve workspace-specific actor identity", () => {
  expect(realtimeKeys.actor("workspace-a", "actor")).not.toEqual(
    realtimeKeys.actor("workspace-b", "actor"),
  );
});

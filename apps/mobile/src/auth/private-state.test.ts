import { onPrivateStateReset, resetPrivateState } from "./private-state";
import { expect, test } from "bun:test";

test("account/workspace exit clears registered private drafts and respects released stores", () => {
  let draft = "private draft";
  const unsubscribe = onPrivateStateReset(() => {
    draft = "";
  });
  resetPrivateState();
  expect(draft).toBe("");
  unsubscribe();
  draft = "another account";
  resetPrivateState();
  expect(draft).toBe("another account");
});

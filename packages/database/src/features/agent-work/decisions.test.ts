import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { proposalFailure } from "./decisions";
import { expect, test } from "bun:test";

test("expected proposal failures become owner-facing outcomes; others are not recorded", () => {
  expect(proposalFailure(new AccessDeniedError())).toEqual({
    status: "failed",
    error: "The target no longer exists or is no longer available.",
  });
  expect(proposalFailure(new ValidationError("Enter a title."))).toEqual({
    status: "failed",
    error: "Enter a title.",
  });
  expect(proposalFailure(new ConflictError("Changed since proposed."))).toEqual({
    status: "failed",
    error: "Changed since proposed.",
  });
  expect(proposalFailure(new Error("connection reset"))).toBeNull();
});

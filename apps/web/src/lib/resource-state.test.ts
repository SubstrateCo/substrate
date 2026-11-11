import { resourceState } from "./resource-state";
import { describe, expect, test } from "bun:test";

describe("resourceState", () => {
  test("redacts cached data after access is lost", () => {
    const error = Object.assign(new Error("Forbidden"), { status: 403 });
    expect(resourceState({ data: { name: "Private" }, error })).toEqual({
      status: "unavailable",
      data: undefined,
      error,
    });
  });
  test("keeps cached data after a temporary failure", () => {
    const data: string[] = [];
    const error = new Error("Network request failed");
    expect(resourceState({ data, error })).toEqual({ status: "stale", data, error });
  });
  test("distinguishes initial loading, failure and an empty result", () => {
    expect(resourceState({ data: undefined }).status).toBe("loading");
    expect(
      resourceState({ data: undefined, error: new Error("Network request failed") }).status,
    ).toBe("error");
    expect(resourceState({ data: [] }).status).toBe("ready");
  });
});

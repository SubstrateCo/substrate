import { listPhase, resourceState } from "./resource-state";
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

describe("listPhase", () => {
  const failure = new Error("Network request failed");
  const forbidden = Object.assign(new Error("Forbidden"), { status: 403 });

  test("loads until the first rows or failure arrive", () => {
    expect(listPhase({ items: [], loading: true })).toEqual({ status: "loading" });
    expect(listPhase({ items: undefined })).toEqual({ status: "loading" });
  });
  test("shows the failure in place of rows that never loaded", () => {
    expect(listPhase({ items: [], loading: true, error: failure })).toEqual({
      status: "error",
      error: failure,
    });
  });
  test("is empty only after a load that found nothing", () => {
    expect(listPhase({ items: [], loading: false })).toEqual({ status: "empty" });
  });
  test("shows loaded rows while a refresh runs", () => {
    expect(listPhase({ items: ["a"], loading: true })).toEqual({ status: "ready", items: ["a"] });
  });
  test("keeps cached rows with the error after a refresh fails", () => {
    expect(listPhase({ items: ["a"], error: failure })).toEqual({
      status: "stale",
      items: ["a"],
      error: failure,
    });
  });
  test("hides cached rows after access is lost", () => {
    expect(listPhase({ items: ["Private"], error: forbidden })).toEqual({
      status: "error",
      error: forbidden,
    });
  });
});

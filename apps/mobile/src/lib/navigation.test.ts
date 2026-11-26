import { firstParam, parseRecordTarget } from "./navigation";
import { describe, expect, test } from "bun:test";

describe("record route targets", () => {
  test("preserves the task's project context", () => {
    const target = { kind: "task", id: "task-1", projectId: "project-1" } as const;
    expect(parseRecordTarget(JSON.stringify(target))).toEqual(target);
  });

  test("rejects unsupported destinations and malformed record identity", () => {
    for (const value of [
      '{"kind":"desktop","id":"x"}',
      '{"kind":"task","id":12}',
      '{"kind":"contact","id":""}',
      '{"kind":"task","id":"x","projectId":2}',
      "null",
      "{",
    ]) {
      expect(parseRecordTarget(value)).toBeUndefined();
    }
  });

  test("reads the first deep-link parameter without joining values", () => {
    expect(firstParam(["contact-1", "contact-2"])).toBe("contact-1");
    expect(firstParam(undefined)).toBeUndefined();
  });
});

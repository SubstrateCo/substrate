import { visibleHarnessOptions } from "./harness-meta";
import { expect, test } from "bun:test";

const values = (options: { value: string }[]) => options.map((option) => option.value);

test("only detected harnesses are offered, plus the agent's current one", () => {
  const inspections = [
    { harness: "opencode", available: false },
    { harness: "claude", available: true, version: "0.109.0" },
    { harness: "codex", available: false },
  ] as const;
  expect(values(visibleHarnessOptions([...inspections], "claude"))).toEqual(["claude"]);
  expect(values(visibleHarnessOptions([...inspections], "codex"))).toEqual(["claude", "codex"]);
});

test("every harness is offered until the desktop reports detection", () => {
  expect(values(visibleHarnessOptions(undefined, "claude"))).toEqual([
    "opencode",
    "claude",
    "codex",
  ]);
});

import { groupActivity } from "./activity-groups";
import { turn } from "./test-support";
import { expect, test } from "bun:test";

const routineRun = (id: string, fields: Parameters<typeof turn>[0] = {}) =>
  turn({ id, sessionKind: "routine", status: "completed", outcome: "replied", ...fields });

const turnIds = (entries: ReturnType<typeof groupActivity>) =>
  entries.map((entry) =>
    entry.kind === "turn" ? entry.turn.id : entry.turns.map((item) => item.id),
  );

test("folds consecutive finished routine runs, including silent ones, into one entry", () => {
  const entries = groupActivity([
    routineRun("r1"),
    routineRun("r2", { outcome: "silent" }),
    turn({ id: "dm", status: "completed", outcome: "replied" }),
    routineRun("r3"),
  ]);
  expect(turnIds(entries)).toEqual([["r1", "r2"], "dm", "r3"]);
});

test("a failed or live routine run stays on its own row and splits the group", () => {
  const entries = groupActivity([
    routineRun("r1"),
    routineRun("r2"),
    routineRun("failed", { status: "failed", outcome: null }),
    routineRun("r3"),
    routineRun("live", { status: "running", outcome: null }),
    routineRun("r4"),
    routineRun("r5"),
  ]);
  expect(turnIds(entries)).toEqual([["r1", "r2"], "failed", "r3", "live", ["r4", "r5"]]);
});

test("finished helper and thread work is never folded", () => {
  const entries = groupActivity([
    turn({ id: "h1", sessionKind: "helper", status: "completed", outcome: "replied" }),
    turn({ id: "h2", sessionKind: "helper", status: "completed", outcome: "replied" }),
  ]);
  expect(turnIds(entries)).toEqual(["h1", "h2"]);
});

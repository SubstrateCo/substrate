import type { AgentRoutineView } from "@substrate/contracts/agent-work";

import { groupRoutines, routineHighlights } from "./routine-groups";
import { expect, test } from "bun:test";

const now = Date.parse("2026-11-26T08:00:00Z");

function routine(name: string, fields: Partial<AgentRoutineView> = {}): AgentRoutineView {
  return {
    id: name,
    userAgentId: "agent",
    name,
    prompt: `Run ${name}`,
    cron: "0 9 * * *",
    timezone: "UTC",
    revision: 1,
    approvedRevision: 1,
    destination: { conversationId: "dm", threadId: null },
    catchUp: "latest",
    enabled: true,
    nextFireAt: "2026-11-26T09:00:00Z",
    lastFiredAt: null,
    createdAt: "2026-11-01T00:00:00Z",
    ...fields,
  };
}

const unapproved = routine("Agent wrote this", {
  revision: 2,
  approvedRevision: 1,
  enabled: false,
});
const soonLater = routine("Inbox digest", { nextFireAt: "2026-11-26T12:00:00Z" });
const soonFirst = routine("Standup", { nextFireAt: "2026-11-26T08:30:00Z" });
const later = routine("Vendor review", { nextFireAt: "2026-12-01T10:00:00Z" });
const paused = routine("Old report", { enabled: false, nextFireAt: null });
const all = [later, paused, soonLater, unapproved, soonFirst];

test("groups routines by what needs the owner, then by when they run next", () => {
  expect(
    groupRoutines(all, { now }).map(({ group, routines }) => [group, routines.map((r) => r.name)]),
  ).toEqual([
    ["needsYou", ["Agent wrote this"]],
    ["soon", ["Standup", "Inbox digest"]],
    ["later", ["Vendor review"]],
    ["paused", ["Old report"]],
  ]);
});

test("an unapproved routine needs the owner even while it is turned off", () => {
  expect(groupRoutines([unapproved], { now }).map((entry) => entry.group)).toEqual(["needsYou"]);
});

test("the active filter keeps only routines that will run, and the search matches the prompt", () => {
  const groups = groupRoutines(all, { now, filter: "active", query: "DIGEST" });
  expect(groups).toEqual([{ group: "soon", routines: [soonLater] }]);
});

test("the overview highlights every routine that needs the owner and only the next runs", () => {
  const extra = routine("Approve me too", { revision: 3, approvedRevision: null });
  expect(routineHighlights([...all, extra], { now, upcoming: 2 })).toEqual({
    needsYou: [unapproved, extra],
    upcoming: [soonFirst, soonLater],
    activeCount: 3,
    pausedCount: 1,
  });
});

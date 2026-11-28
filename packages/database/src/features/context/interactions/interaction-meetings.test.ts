import { organizationApps } from "../../../core/apps/schema";
import { RepositoryContext } from "../../../core/repository-context";
import {
  enableCalendar,
  insertCalendar,
  insertMeeting,
} from "../../../testing/calendar-completion";
import { setupDatabase } from "../../../testing/database";
import { recordMeetingInteractions } from "../../calendar/completion";
import { linkSummary } from "../../mcp/links";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();

async function recordedMeeting(title?: string) {
  await enableCalendar(f);
  const meeting = await insertMeeting(f, await insertCalendar(f), {
    title,
    attendees: [{ email: "guest@client.com", displayName: "Guest" }],
  });
  const { result } = await recordMeetingInteractions(f.db, {
    organizationId: f.orgA,
    eventEntityId: meeting,
    now: new Date("2026-11-20T12:00:00Z"),
  });
  return { meeting, interaction: result.interactionEntityIds[0]! };
}

test("the calendar owner opens a meeting interaction and sees the meeting as a related record", async () => {
  const { meeting, interaction } = await recordedMeeting();
  const record = await f.forActor(f.alice).contactInteractions.workspaceRecord(interaction);
  expect(record.interaction.origin).toBe("calendar_event");
  expect(record.links).toEqual([
    {
      entityId: meeting,
      entityType: "calendar_event",
      title: "Quarterly review",
      relation: "Related record",
      projectEntityId: null,
      contactEntityId: null,
    },
  ]);
});

test("a meeting without a title is an untitled related record", async () => {
  const { interaction } = await recordedMeeting("   ");
  const record = await f.forActor(f.alice).contactInteractions.workspaceRecord(interaction);
  expect(record.links.map((link) => link.title)).toEqual(["Untitled meeting"]);
});

test("another member opens the meeting interaction without the meeting link", async () => {
  const { interaction } = await recordedMeeting();
  const record = await f.forActor(f.bob).contactInteractions.workspaceRecord(interaction);
  expect(record.interaction.entityId).toBe(interaction);
  expect(record.links).toEqual([]);
});

test("the owner sees no meeting link while the calendar app is disabled", async () => {
  const { interaction } = await recordedMeeting();
  await f.db
    .update(organizationApps)
    .set({ enabled: false })
    .where(
      and(eq(organizationApps.organizationId, f.orgA), eq(organizationApps.appId, "calendar")),
    );
  const record = await f.forActor(f.alice).contactInteractions.workspaceRecord(interaction);
  expect(record.links).toEqual([]);
});

test("agent link summaries on a meeting interaction leave out the meeting", async () => {
  const { interaction } = await recordedMeeting();
  const ctx = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const linked = await linkSummary(ctx, { userId: "alice", organizationId: f.orgA }, interaction);
  expect(linked).toMatchObject({ records: [], recordCount: 0 });
});

test("source calendar filters summaries, timelines and directories without exposing private sources", async () => {
  await enableCalendar(f);
  const calendar = await insertCalendar(f);
  const otherCalendar = await insertCalendar(f);
  const recorded: string[] = [];
  for (const source of [calendar, otherCalendar]) {
    const meeting = await insertMeeting(f, source, {
      attendees: [{ email: `${source}@client.com`, displayName: "Guest" }],
    });
    const { result } = await recordMeetingInteractions(f.db, {
      organizationId: f.orgA,
      eventEntityId: meeting,
      now: new Date("2026-11-20T12:00:00Z"),
    });
    recorded.push(result.interactionEntityIds[0]!);
  }
  const period = {
    organizationId: f.orgA,
    from: "2026-11-01T00:00:00.000Z",
    until: "2026-12-01T00:00:00.000Z",
    timeZone: "UTC",
    sourceCalendarEntityId: calendar,
  };
  const owner = f.forActor(f.alice).contactInteractions;
  expect((await owner.workspaceActivity(period)).summary.total).toBe(1);
  expect((await owner.workspaceTimeline(period)).items.map((row) => row.entityId)).toEqual([
    recorded[0]!,
  ]);
  expect((await owner.workspaceDirectory({ ...period, type: "people" })).items).toMatchObject([
    { count: 1 },
  ]);
  const member = f.forActor(f.bob).contactInteractions;
  expect((await member.workspaceActivity(period)).summary.total).toBe(0);
  expect((await member.workspaceTimeline(period)).items).toEqual([]);
  expect((await member.workspaceDirectory({ ...period, type: "people" })).items).toEqual([]);
  expect(
    (await owner.workspaceActivity({ ...period, sourceCalendarEntityId: crypto.randomUUID() }))
      .summary.total,
  ).toBe(0);
});

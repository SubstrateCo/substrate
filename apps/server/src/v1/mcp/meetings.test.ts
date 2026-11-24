import { sessionKeys } from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import {
  agentInvocations,
  agentToolRequests,
  organizationApps,
} from "../../../../../packages/database/src/schema";
import { dmTurn, threadTurn } from "../../../../../packages/database/src/testing/agent-work";
import { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { executeAgentTool } from "./execution";
import { callerFixture } from "./test-support";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { rejects } from "node:assert/strict";

const f = setupDatabase();
const enable = () =>
  f.db
    .insert(organizationApps)
    .values({ organizationId: f.orgA, appId: "meetings", enabled: true });
test("the owner's agent writes the human's archive once, links its source, and reads attributed text in pages", async () => {
  await enable();
  const x = await callerFixture(f),
    turn = { ...dmTurn(x.dm.id), installationId: x.agent.identity.installationId };
  const message = await x.alice.sendMessage(x.dm.id, "Record our fictional relay inspection.");
  const transcript = "🎙".repeat(3000) + "Second page.";
  const input = {
    requestId: crypto.randomUUID(),
    sourceMessageId: message.id,
    meeting: {
      title: "Relay inspection",
      startsAt: "2026-11-18T10:00:00",
      notes: "Replace violet cover.",
      transcript,
    },
  };
  const { result, hints } = await executeAgentTool(
    f.db,
    x.agentIdentity,
    "create_meeting",
    input,
    turn,
  );
  const { id } = result.output;
  expect(hints).toContainEqual({
    audience: realtimeKeys.actor(f.orgA, f.alice),
    domain: "meetings",
  });
  expect(await x.call("create_meeting", input, turn)).toEqual({ id });
  await rejects(
    x.call("create_meeting", { ...input, meeting: { ...input.meeting, title: "Other" } }, turn),
  );
  expect(JSON.stringify(await f.db.select().from(agentToolRequests))).not.toContain(
    "Replace violet",
  );
  const owner = (await f.forSession("alice")).meetings;
  expect((await owner.detail(id))?.sourceMessage).toEqual({
    messageId: message.id,
    conversationId: x.dm.id,
  });
  expect(await f.context().messageLinks(message.id)).toMatchObject([
    { entityId: id, entityType: "meeting", title: input.meeting.title, purpose: "source" },
  ]);
  expect((await x.call("list_meetings", { q: "violet" }, turn)).items.map((m) => m.id)).toEqual([
    id,
  ]);
  const detail = await x.call("get_meeting", { meetingId: id }, turn);
  expect(detail.sourceMessage).toEqual({ messageId: message.id, conversationId: x.dm.id });
  const thread = await x.call("read_thread", { messageId: message.id }, turn);
  expect(thread.root.records).toEqual([]);
  const source = { sourceId: detail.sources[0]!.id, meetingId: id };
  expect(await x.call("read_meeting_source", { ...source, section: "notes" }, turn)).toMatchObject({
    text: input.meeting.notes,
    nextOffset: null,
  });
  const first = await x.call("read_meeting_source", { ...source, section: "transcript" }, turn);
  expect(first).toMatchObject({
    text: "🎙".repeat(3000),
    nextOffset: 3000,
    speaker: null,
    offsetMs: null,
  });
  expect(
    await x.call(
      "read_meeting_source",
      { ...source, section: "transcript", offset: first.nextOffset! },
      turn,
    ),
  ).toMatchObject({ text: "Second page.", nextTurn: null, nextOffset: null });
  const other = (await f.forSession("bob")).meetings;
  const { result: theirs } = await other.create(input.meeting, crypto.randomUUID());
  expect(await other.detail(id)).toBeNull();
  await rejects(x.call("get_meeting", { meetingId: theirs.id }, turn));
  await rejects(
    x.call(
      "read_meeting_source",
      { ...source, sourceId: (await other.detail(theirs.id))!.originals[0]!.id, section: "notes" },
      turn,
    ),
  );
  await f.db
    .update(organizationApps)
    .set({ enabled: false })
    .where(eq(organizationApps.appId, "meetings"));
  expect(await f.context().messageLinks(message.id)).toEqual([]);
  await f.db
    .update(organizationApps)
    .set({ enabled: true })
    .where(eq(organizationApps.appId, "meetings"));
  await x.alice.deleteMessage(message.id);
  expect((await owner.detail(id))?.sourceMessage).toBeNull();
  await rejects(x.call("create_meeting", input, turn));
});
test("private tools reject shared, caller and background turns; writes require the home device and replay rechecks app access", async () => {
  const x = await callerFixture(f),
    turn = dmTurn(x.dm.id);
  await rejects(x.call("list_meetings", {}, turn), { name: "AppDisabledError" });
  await enable();
  const input = {
    requestId: crypto.randomUUID(),
    meeting: { title: "Private review", startsAt: "2026-11-18T10:00:00Z" },
  };
  await rejects(x.call("create_meeting", input, { ...turn, installationId: crypto.randomUUID() }));
  const created = await x.call("create_meeting", input, turn);
  await x.policy("anyone");
  const msg = await x.bob.sendMessage(x.channel.id, `${x.mention} find notes`);
  const [invocation] = await f.db.select().from(agentInvocations);
  const shared = threadTurn(x.channel.id, msg.id);
  for (const unsafe of [
    shared,
    { ...shared, invocationIds: [invocation!.id] },
    dmTurn(x.dm.id, "unattended"),
    { ...turn, sessionKey: sessionKeys.routine(crypto.randomUUID()), origin: null },
    { ...turn, destination: { conversationId: x.channel.id, threadId: msg.id } },
  ]) {
    await rejects(x.call("list_meetings", {}, unsafe));
    await rejects(x.call("get_meeting", { meetingId: created.id }, unsafe));
    await rejects(x.call("create_meeting", input, unsafe));
  }
  await rejects(
    x.call(
      "create_meeting",
      { ...input, requestId: crypto.randomUUID(), sourceMessageId: msg.id },
      turn,
    ),
  );
  expect((await x.call("list_meetings", {}, turn)).items).toHaveLength(1);
  await f.db
    .update(organizationApps)
    .set({ enabled: false })
    .where(eq(organizationApps.appId, "meetings"));
  await rejects(x.call("create_meeting", input, turn), { name: "AppDisabledError" });
});

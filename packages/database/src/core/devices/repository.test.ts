import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { deviceOnline, registerDevice, touchDevice } from "./repository";
import { desktopDevices } from "./schema";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();

async function seenAgo(id: string, seconds: number) {
  const [row] = await f.db
    .update(desktopDevices)
    .set({ lastSeenAt: sql`now() - make_interval(secs => ${seconds})` })
    .where(eq(desktopDevices.id, id))
    .returning();
  return row!.lastSeenAt;
}

test("device calls write last_seen_at at most every 30 seconds", async () => {
  const installationId = crypto.randomUUID();
  const device = await registerDevice(f.db, "alice", {
    installationId,
    name: "Mac",
    platform: "darwin",
  });
  const recent = await seenAgo(device.id, 10);
  const { db, queries } = recordQueries();
  expect((await touchDevice(db, "alice", installationId)).id).toBe(device.id);
  expect(queries.filter((query) => query.startsWith("update"))).toEqual([]);
  const [unchanged] = await f.db
    .select()
    .from(desktopDevices)
    .where(eq(desktopDevices.id, device.id));
  expect(unchanged!.lastSeenAt).toEqual(recent);

  const stale = await seenAgo(device.id, 40);
  await touchDevice(f.db, "alice", installationId);
  const [touched] = await f.db
    .select()
    .from(desktopDevices)
    .where(eq(desktopDevices.id, device.id));
  expect(touched!.lastSeenAt.getTime()).toBeGreaterThan(stale.getTime() + 30_000);
});

test("a device calling every minute stays online, and one that stops goes offline after 90 seconds", async () => {
  const installationId = crypto.randomUUID();
  const device = await registerDevice(f.db, "alice", {
    installationId,
    name: "Mac",
    platform: "darwin",
  });
  const online = async () => {
    const [row] = await f.db
      .select({ online: deviceOnline })
      .from(desktopDevices)
      .where(eq(desktopDevices.id, device.id));
    return row!.online;
  };
  // A call a minute after the last write is past the 30 s throttle, so it writes.
  await seenAgo(device.id, 60);
  await touchDevice(f.db, "alice", installationId);
  expect(await online()).toBe(true);
  await seenAgo(device.id, 91);
  expect(await online()).toBe(false);
});

test("only the registering user's device resolves", async () => {
  const installationId = crypto.randomUUID();
  await registerDevice(f.db, "alice", { installationId, name: "Mac", platform: "darwin" });
  expect(await rejection(touchDevice(f.db, "bob", installationId))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(touchDevice(f.db, "alice", crypto.randomUUID()))).toBeInstanceOf(
    AccessDeniedError,
  );
});

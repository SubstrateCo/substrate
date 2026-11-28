import { AccessDeniedError } from "../../errors";
import type { DatabaseExecutor } from "../executor";
import { desktopDevices } from "./schema";
import { and, eq, sql } from "drizzle-orm";

export const deviceOnline = sql<boolean>`${desktopDevices.lastSeenAt} > now() - interval '90 seconds'`;

export async function registerDevice(
  db: DatabaseExecutor,
  userId: string,
  input: { installationId: string; name: string; platform: string },
) {
  const [device] = await db
    .insert(desktopDevices)
    .values({ userId, ...input })
    .onConflictDoUpdate({
      target: [desktopDevices.userId, desktopDevices.installationId],
      set: { name: input.name, platform: input.platform, lastSeenAt: sql`now()` },
    })
    .returning();
  return device!;
}

const ownedDevice = (userId: string, installationId: string) =>
  and(eq(desktopDevices.userId, userId), eq(desktopDevices.installationId, installationId));

export async function touchDevice(db: DatabaseExecutor, userId: string, installationId: string) {
  const owned = db
    .$with("owned_device")
    .as(db.select().from(desktopDevices).where(ownedDevice(userId, installationId)));
  const touched = db.$with("touched_device").as(
    db
      .update(desktopDevices)
      .set({ lastSeenAt: sql`now()` })
      .where(
        and(
          eq(
            desktopDevices.id,
            sql`(select id from ${owned} where last_seen_at < now() - interval '30 seconds')`,
          ),
          sql`${desktopDevices.lastSeenAt} < now() - interval '30 seconds'`,
        ),
      )
      .returning({ id: desktopDevices.id }),
  );
  // The data-changing CTE runs even when the final select only reads the owned device.
  // Keep its current-row predicate: another heartbeat may refresh it while this write waits.
  const [device] = await db.with(owned, touched).select().from(owned);
  if (!device) throw new AccessDeniedError();
  return device;
}

export async function findDevice(db: DatabaseExecutor, userId: string, installationId: string) {
  const [device] = await db
    .select()
    .from(desktopDevices)
    .where(ownedDevice(userId, installationId));
  return device ?? null;
}

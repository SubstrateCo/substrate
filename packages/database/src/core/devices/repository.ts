import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError } from "../../errors";
import { desktopDevices } from "./schema";
import { and, eq, sql } from "drizzle-orm";

/** A device counts as online while it sent a heartbeat in the last 90 seconds. */
export const deviceOnline = sql<boolean>`${desktopDevices.lastSeenAt} > now() - interval '90 seconds'`;

// Trusted session identity only. The installation ID names a device of this user; it proves nothing.
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

/** Resolves and marks the device as seen. A device must register before it acts. */
export async function touchDevice(db: DatabaseExecutor, userId: string, installationId: string) {
  const [device] = await db
    .update(desktopDevices)
    .set({ lastSeenAt: sql`now()` })
    .where(
      and(eq(desktopDevices.userId, userId), eq(desktopDevices.installationId, installationId)),
    )
    .returning();
  if (!device) throw new AccessDeniedError();
  return device;
}

export async function findDevice(db: DatabaseExecutor, userId: string, installationId: string) {
  const [device] = await db
    .select()
    .from(desktopDevices)
    .where(
      and(eq(desktopDevices.userId, userId), eq(desktopDevices.installationId, installationId)),
    );
  return device ?? null;
}

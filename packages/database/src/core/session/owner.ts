import type { DatabaseExecutor } from "../../client";
import { AccessDeniedError } from "../../errors";
import { user } from "../authentication/schema";
import type { OwnerSessionIdentity } from "./identity";
import { and, eq } from "drizzle-orm";

export async function ownerSession(db: DatabaseExecutor, identity: OwnerSessionIdentity) {
  const [owner] = await db
    .select({ userId: user.id })
    .from(user)
    .where(and(eq(user.id, identity.userId), eq(user.emailVerified, true)));
  if (!owner) throw new AccessDeniedError();
  return Object.freeze({ ...identity });
}

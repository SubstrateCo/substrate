import type { DatabaseExecutor } from "../../client";
import { touchDevice } from "../devices/repository";
import type { SessionIdentity } from "./identity";
import { workspaceContext } from "./workspace";

export interface DeviceIdentity extends Pick<SessionIdentity, "userId" | "organizationId"> {
  installationId: string;
}

export async function requireDevice(db: DatabaseExecutor, identity: DeviceIdentity) {
  await workspaceContext(db, { userId: identity.userId, organizationId: identity.organizationId });
  return touchDevice(db, identity.userId, identity.installationId);
}

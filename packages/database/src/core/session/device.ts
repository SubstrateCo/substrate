import { touchDevice } from "../devices/repository";
import type { DatabaseExecutor } from "../executor";
import type { SessionIdentity } from "./identity";
import { workspaceContext } from "./workspace";

export interface DeviceIdentity extends Pick<SessionIdentity, "userId" | "organizationId"> {
  installationId: string;
}

export interface ResolvedDeviceIdentity extends DeviceIdentity {
  deviceId: string;
}

export async function requireDevice(db: DatabaseExecutor, identity: DeviceIdentity) {
  await workspaceContext(db, { userId: identity.userId, organizationId: identity.organizationId });
  return touchDevice(db, identity.userId, identity.installationId);
}

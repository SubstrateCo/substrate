import type { DeviceCapability } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../client";
import { committedWrite } from "../../core/effects";
import type { ResolvedDeviceIdentity } from "../../core/session/device";
import {
  openRequestForDevice,
  closeRequestForDevice,
  requestAnswersForDevice,
  type OpenRequestInput,
} from "./device-requests";
import { loadSourcesForDevice } from "./sources";
import { publishStatusForDevice, type PublishStatusInput } from "./status";
import { pullWakesForDevice, ackWakesForDevice } from "./wakes";

export function createDeviceWorkRepository(db: DatabaseExecutor, identity: ResolvedDeviceIdentity) {
  return {
    pullWakes: (limit: number, capabilities: readonly DeviceCapability[] = []) =>
      committedWrite(pullWakesForDevice)(db, identity, limit, capabilities),
    ackWakes: (ids: string[]) => committedWrite(ackWakesForDevice)(db, identity, ids),
    loadSources: (messageIds: string[], invocationIds: string[] = []) =>
      committedWrite(loadSourcesForDevice)(db, identity, messageIds, invocationIds),
    publishStatus: (input: PublishStatusInput) =>
      committedWrite(publishStatusForDevice)(db, identity, input),
    openRequest: (input: OpenRequestInput) =>
      committedWrite(openRequestForDevice)(db, identity, input),
    closeRequest: (requestId: string, status: Parameters<typeof closeRequestForDevice>[3]) =>
      committedWrite(closeRequestForDevice)(db, identity, requestId, status),
    requestAnswers: () => db.transaction((tx) => requestAnswersForDevice(tx, identity)),
  };
}

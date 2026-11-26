import type { DeviceCapability } from "@substrate/contracts/agent-work";

import { committedWrite } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import type { ResolvedDeviceIdentity } from "../../core/session/device";
import { AccessDeniedError, ValidationError } from "../../errors";
import { requirePlace } from "./place";
import {
  openRequestForDevice,
  closeRequestForDevice,
  requestAnswersForDevice,
  requestStatusForDevice,
  type OpenRequestInput,
} from "./requests/device-requests";
import { loadSourcesForDevice } from "./sources";
import { publishStatusForDevice, type PublishStatusInput } from "./status";
import { pullWakesForDevice, ackWakesForDevice } from "./wakes/wakes";

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
    requestAnswers: () => requestAnswersForDevice(db, identity),
    requestStatus: (requestId: string) => requestStatusForDevice(db, identity, requestId),
    /** Whether the owner can see the place. Turns that post there check it again. */
    canUsePlace: async (place: { conversationId: string; threadId: string | null }) => {
      try {
        await requirePlace(db, identity, place);
        return true;
      } catch (error) {
        if (error instanceof AccessDeniedError || error instanceof ValidationError) return false;
        throw error;
      }
    },
  };
}

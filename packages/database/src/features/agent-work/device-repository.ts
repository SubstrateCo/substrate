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

export function createDeviceWorkRepository(db: DatabaseExecutor, identity: ResolvedDeviceIdentity) {
  return {
    loadSources: (messageIds: string[]) =>
      committedWrite(loadSourcesForDevice)(db, identity, messageIds),
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

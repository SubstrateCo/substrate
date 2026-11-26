import type { Database } from "./core/executor";
import * as storage from "./core/storage/repository";
import { attachmentReferences } from "./features/files/repository";

export { createDatabase } from "./client";
export type { Database, DatabaseExecutor, Transaction } from "./core/executor";
export * from "./core/actors/provisioning";
export { registerDevice, touchDevice } from "./core/devices/repository";
export { projectIconAccess } from "./features/files/project-icons";
export {
  claimOutbox,
  finishOutbox,
  outboxClaimLimit,
  recordOutbox,
  type OutboxBatch,
} from "./core/outbox/outbox";
export type { RealtimeChange } from "./core/outbox/schema";
export { pruneRecords } from "./maintenance";
export { sweepAgentLeases } from "./features/agent-work/host/sweep";
export { fireRoutines } from "./features/agent-work/routines/scheduler";
export { migrateDatabase } from "./migrations";

export function createStorageRepository(db: Database, references = attachmentReferences) {
  return storage.createStorageRepository(db, references);
}

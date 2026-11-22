import type { Database } from "./core/executor";
import * as storage from "./core/storage/repository";
import { attachmentReferences } from "./features/files/repository";

export { createDatabase } from "./client";
export type { Database, DatabaseExecutor, Transaction } from "./core/executor";
export * from "./core/actors/provisioning";
export { registerDevice, touchDevice } from "./core/devices/repository";
export { pruneRecords } from "./maintenance";
export { migrateDatabase } from "./migrations";

export function createStorageRepository(db: Database, references = attachmentReferences) {
  return storage.createStorageRepository(db, references);
}

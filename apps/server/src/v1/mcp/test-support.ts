import type { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { mcpFixture } from "../../../../../packages/database/src/testing/mcp";
import { ObjectNotFoundError, type ObjectStorage } from "../../storage/types";
import { storageFileReader } from "../files/agent-file-reader";
import { createSharpImageCodec } from "../files/image";

type Fixture = ReturnType<typeof setupDatabase>;

/** Object storage in memory. Only reads and writes are supported. */
export function memoryStorage(objects = new Map<string, Uint8Array>()): ObjectStorage & {
  objects: Map<string, Uint8Array>;
} {
  const unsupported = () => Promise.reject(new Error("Not supported in tests."));
  return {
    objects,
    async read(key) {
      const bytes = objects.get(key);
      if (!bytes) throw new ObjectNotFoundError("Object not found.");
      return bytes;
    },
    async put(key, bytes) {
      objects.set(key, bytes.slice());
    },
    async putImmutable(key, bytes) {
      if (!objects.has(key)) objects.set(key, bytes.slice());
    },
    signUpload: unsupported,
    signDownload: unsupported,
    removeMany: unsupported,
  };
}

/** The agent's MCP tools, reading file bytes from in-memory object storage. */
export async function agentWorkFixture(f: Fixture) {
  const storage = memoryStorage();
  return {
    ...(await mcpFixture(f, storageFileReader(storage, createSharpImageCodec()))),
    storage,
  };
}

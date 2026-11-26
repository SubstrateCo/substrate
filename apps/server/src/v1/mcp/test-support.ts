import type { TurnContext, WorkspaceApiRequest } from "@substrate/contracts/harness/mcp";
import type { McpOutput, ServerToolName } from "@substrate/contracts/harness/tools";

import {
  agentWorkFixture as persistenceFixture,
  callerFixture as persistenceCallerFixture,
} from "../../../../../packages/database/src/testing/agent-work";
import type { setupDatabase } from "../../../../../packages/database/src/testing/database";
import { ObjectNotFoundError, type ObjectStorage } from "../../storage/types";
import { storageFileReader } from "../files/agent-file-reader";
import { executeAgentTool } from "./execution";

type Fixture = ReturnType<typeof setupDatabase>;
type AgentFixture = Awaited<ReturnType<typeof persistenceFixture>>;

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

function withTools(f: Fixture, base: AgentFixture) {
  const storage = memoryStorage();
  const reader = storageFileReader(storage);
  const execute = async (
    tool: ServerToolName,
    input: WorkspaceApiRequest["input"],
    turn: TurnContext,
  ) =>
    (
      await executeAgentTool(
        f.db,
        base.agentIdentity,
        tool,
        input,
        "installationId" in turn
          ? turn
          : { ...turn, installationId: base.agent.identity.installationId },
        reader,
      )
    ).result;
  /** Runs a call that does not wait for approval and returns its output. */
  const call = async <K extends ServerToolName>(
    tool: K,
    input: WorkspaceApiRequest["input"],
    turn: TurnContext,
  ) => {
    const execution = await execute(tool, input, turn);
    if ("pending" in execution) throw new Error(`${tool} waits for approval`);
    // SAFETY: execution parses its payload with the output schema registered for K.
    return execution.output as McpOutput<K>;
  };
  /** Makes a call that waits for approval and returns its proposal's request ID. */
  const pending = async (
    tool: ServerToolName,
    input: WorkspaceApiRequest["input"],
    turn: TurnContext,
  ) => {
    const execution = await execute(tool, input, turn);
    if (!("pending" in execution)) throw new Error(`${tool} ran without approval`);
    return execution.pending.requestId;
  };
  return { ...base, call, pending, storage };
}

export async function agentWorkFixture(f: Fixture) {
  return withTools(f, await persistenceFixture(f));
}

export async function callerFixture(f: Fixture) {
  const base = await persistenceCallerFixture(f);
  return { ...base, ...withTools(f, base) };
}

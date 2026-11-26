import { openLocalDatabase, serialTransactions, type RunTransaction } from "../database.ts";
import { eventRepository } from "./events.ts";
import { handoffRepository } from "./handoffs.ts";
import { mcpServerRepository } from "./mcp-servers.ts";
import { nativeSessionRepository } from "./native-sessions.ts";
import { turnRunRepository } from "./turn-runs.ts";

/**
 * What the agent host keeps for one account: native sessions, turn attempts, transcripts,
 * handoffs and MCP servers. The server owns sessions, work items and turns. Every operation runs
 * in its own transaction, one at a time.
 */
export class AgentWorkStore {
  readonly nativeSessions: ReturnType<typeof nativeSessionRepository>;
  readonly turnRuns: ReturnType<typeof turnRunRepository>;
  readonly events: ReturnType<typeof eventRepository>;
  readonly handoffs: ReturnType<typeof handoffRepository>;
  readonly mcpServers: ReturnType<typeof mcpServerRepository>;
  readonly close: () => void;

  private constructor(run: RunTransaction, close: () => void) {
    this.nativeSessions = nativeSessionRepository(run);
    this.turnRuns = turnRunRepository(run);
    this.events = eventRepository(run);
    this.handoffs = handoffRepository(run);
    this.mcpServers = mcpServerRepository(run);
    this.close = close;
  }

  static async open(path: string, migrationsDirectory?: string): Promise<AgentWorkStore> {
    const { database, close } = await openLocalDatabase(path, migrationsDirectory);
    return new AgentWorkStore(serialTransactions(database), close);
  }
}

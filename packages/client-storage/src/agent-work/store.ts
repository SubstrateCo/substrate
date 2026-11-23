import { openLocalDatabase, serialTransactions, type RunTransaction } from "../database.ts";
import { inbox, outputs, sessions } from "../schema/index.ts";
import { epochRepository } from "./epochs.ts";
import { eventRepository } from "./events.ts";
import { helperRepository } from "./helpers.ts";
import { inboxRepository } from "./inbox.ts";
import { mcpServerRepository } from "./mcp-servers.ts";
import { outputRepository } from "./outputs.ts";
import { routineRepository } from "./routines.ts";
import { sessionRepository } from "./sessions.ts";
import type { TurnRow } from "./turns/claim.ts";
import { turnRepository } from "./turns/repository.ts";
import { turnView } from "./views.ts";
import { inArray } from "drizzle-orm";

function viewRepository(run: RunTransaction) {
  return {
    /** Turn views with their sessions, items and outputs, in the order given. */
    turns: (rows: TurnRow[]) =>
      run(async (tx) => {
        if (!rows.length) return [];
        const ids = rows.map((row) => row.id);
        const [sessionRows, itemRows, outputRows] = await Promise.all([
          tx
            .select({ id: sessions.id, kind: sessions.kind })
            .from(sessions)
            .where(inArray(sessions.id, [...new Set(rows.map((row) => row.sessionId))]))
            .all(),
          tx.select().from(inbox).where(inArray(inbox.turnId, ids)).orderBy(inbox.createdAt).all(),
          tx
            .select()
            .from(outputs)
            .where(inArray(outputs.turnId, ids))
            .orderBy(outputs.createdAt)
            .all(),
        ]);
        const sessionById = new Map(sessionRows.map((row) => [row.id, row]));
        return rows.flatMap((row) => {
          const session = sessionById.get(row.sessionId);
          if (!session) return [];
          return [
            turnView(row, {
              session,
              items: itemRows.filter((item) => item.turnId === row.id),
              outputs: outputRows.filter((output) => output.turnId === row.id),
            }),
          ];
        });
      }),
  };
}

/**
 * Agent work state on the home desktop, for one account. Every operation runs in its own
 * transaction, one at a time.
 */
export class AgentWorkStore {
  readonly sessions: ReturnType<typeof sessionRepository>;
  readonly inbox: ReturnType<typeof inboxRepository>;
  readonly turns: ReturnType<typeof turnRepository>;
  readonly events: ReturnType<typeof eventRepository>;
  readonly outputs: ReturnType<typeof outputRepository>;
  readonly routines: ReturnType<typeof routineRepository>;
  readonly helpers: ReturnType<typeof helperRepository>;
  readonly epochs: ReturnType<typeof epochRepository>;
  readonly mcpServers: ReturnType<typeof mcpServerRepository>;
  readonly views: ReturnType<typeof viewRepository>;
  readonly close: () => void;

  private constructor(run: RunTransaction, close: () => void) {
    this.sessions = sessionRepository(run);
    this.inbox = inboxRepository(run);
    this.turns = turnRepository(run);
    this.events = eventRepository(run);
    this.outputs = outputRepository(run);
    this.routines = routineRepository(run);
    this.helpers = helperRepository(run);
    this.epochs = epochRepository(run);
    this.mcpServers = mcpServerRepository(run);
    this.views = viewRepository(run);
    this.close = close;
  }

  static async open(path: string, migrationsDirectory?: string): Promise<AgentWorkStore> {
    const { database, close } = await openLocalDatabase(path, migrationsDirectory);
    return new AgentWorkStore(serialTransactions(database), close);
  }
}

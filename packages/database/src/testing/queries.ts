import { discardEffects, testDatabase } from "./connection";
import { drizzle } from "drizzle-orm/postgres-js";

// commit() stores every write's hints in the outbox. Statement counts measure the write itself.
const outboxInsert = /^\s*insert into "realtime_outbox"/i;

export function recordQueries(onQuery?: (query: string) => void) {
  const queries: string[] = [];
  const parameters: unknown[][] = [];
  const db = discardEffects(
    drizzle(testDatabase.$client, {
      logger: {
        logQuery: (query, params) => {
          if (outboxInsert.test(query)) return;
          queries.push(query);
          parameters.push(params);
          onQuery?.(query);
        },
      },
    }),
  );
  return { db, queries, parameters };
}

/** The recorded statement that pages a table: it reads from it and orders the rows. */
export function pageStatement(recorded: ReturnType<typeof recordQueries>, table: string) {
  const index = recorded.queries.findIndex(
    (query) => query.includes(`from "${table}"`) && query.includes("order by"),
  );
  if (index < 0) throw new Error(`No recorded page query reads ${table}.`);
  return { query: recorded.queries[index]!, parameters: recorded.parameters[index]! };
}

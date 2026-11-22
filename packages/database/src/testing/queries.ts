import { discardEffects, testDatabase } from "./connection";
import { drizzle } from "drizzle-orm/postgres-js";

export function recordQueries(onQuery?: (query: string) => void) {
  const queries: string[] = [];
  const parameters: unknown[][] = [];
  const db = discardEffects(
    drizzle(testDatabase.$client, {
      logger: {
        logQuery: (query, params) => {
          queries.push(query);
          parameters.push(params);
          onQuery?.(query);
        },
      },
    }),
  );
  return { db, queries, parameters };
}

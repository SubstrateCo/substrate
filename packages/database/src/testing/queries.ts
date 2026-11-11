import * as schema from "../schema";
import { discardEffects, testDatabase } from "./connection";
import { drizzle } from "drizzle-orm/postgres-js";

export function recordQueries() {
  const queries: string[] = [];
  const parameters: unknown[][] = [];
  const db = discardEffects(
    drizzle(testDatabase.$client, {
      schema,
      logger: {
        logQuery: (query, params) => {
          queries.push(query);
          parameters.push(params);
        },
      },
    }),
  );
  return { db, queries, parameters };
}

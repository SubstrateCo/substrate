import * as schema from "../schema";
import { testDatabase } from "./connection";
import { drizzle } from "drizzle-orm/postgres-js";

export function recordQueries() {
  const queries: string[] = [];
  const parameters: unknown[][] = [];
  const db = drizzle(testDatabase.$client, {
    schema,
    logger: {
      logQuery: (query, params) => {
        queries.push(query);
        parameters.push(params);
      },
    },
  });
  return { db, queries, parameters };
}

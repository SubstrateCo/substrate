import * as schema from "../schema";
import { testDatabase } from "./connection";
import { drizzle } from "drizzle-orm/postgres-js";

export function recordQueries() {
  const queries: string[] = [];
  const db = drizzle(testDatabase.$client, {
    schema,
    logger: {
      logQuery: (query) => {
        queries.push(query);
      },
    },
  });
  return { db, queries };
}

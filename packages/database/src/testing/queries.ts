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

// PostgreSQL evaluates each WITH RECURSIVE subquery on its own, so a statement that repeats the
// visibility CTE computes the visible set again. Statement counts cannot see this.
export function maxRecursiveCtes(queries: string[]) {
  return Math.max(0, ...queries.map((query) => query.match(/with recursive/gi)?.length ?? 0));
}

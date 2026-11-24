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

/**
 * The JSON plan of a recorded statement with sequential scans off. Test tables are tiny, so the
 * planner would scan them anyway; with scans off the plan shows whether an index can serve it.
 * It does not prove the plan that production statistics would choose.
 */
export function indexPlan(query: string, parameters: unknown[]) {
  return testDatabase.$client.begin(async (sql) => {
    await sql.unsafe("set local enable_seqscan = off");
    // SAFETY: these are the values the logger recorded for this statement.
    const plan = await sql.unsafe(`explain (format json) ${query}`, parameters as never[]);
    return JSON.stringify(plan);
  });
}

/** The recorded statement that pages a table: it reads from it and orders the rows. */
export function pageStatement(recorded: ReturnType<typeof recordQueries>, table: string) {
  const index = recorded.queries.findIndex(
    (query) => query.includes(`from "${table}"`) && query.includes("order by"),
  );
  if (index < 0) throw new Error(`No recorded page query reads ${table}.`);
  return { query: recorded.queries[index]!, parameters: recorded.parameters[index]! };
}

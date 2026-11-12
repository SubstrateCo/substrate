import {
  dropIndex,
  explain,
  indexStatistics,
  metadata,
  setPlanTimeouts,
  statementStatistics,
} from "./catalog";
import { connect, errorMessage, writeJson } from "./connection";
import { summarizePlan } from "./plan-analysis";
import type { Plans, StatementPlan, WhatIf } from "./plan-analysis";

console.warn(
  "WARNING: what-if checks briefly take ACCESS EXCLUSIVE locks. Run only after load, on an idle database.",
);
// Check the database guard even when confirmation is absent.
const sql = connect();
try {
  if (!process.argv.slice(2).includes("--yes")) {
    throw new Error("Pass --yes to allow transactional DROP INDEX checks (always rolled back).");
  }
  const info = await metadata(sql);
  const statements = await statementStatistics(sql);
  const indexes = await indexStatistics(sql);
  await setPlanTimeouts(sql);
  const baseline: StatementPlan[] = [];
  for (const statement of statements) {
    const entry: StatementPlan = {
      key: statement.key,
      queryid: statement.queryid,
      query: statement.query,
    };
    try {
      entry.plan = summarizePlan(await explain(sql, statement.query));
    } catch (error) {
      entry.error = errorMessage(error);
    }
    baseline.push(entry);
  }

  const whatIf: WhatIf[] = [];
  for (const index of indexes.filter(
    (index) => !index.unique && !index.primary && !index.constraint_name,
  )) {
    const affected = baseline.filter((statement) => statement.plan?.indexes.includes(index.name));
    const result: WhatIf = { table: index.table, index: index.name, statements: [] };
    const rollback = new Error("Rollback what-if index change");
    try {
      await sql.begin(async (transaction) => {
        await setPlanTimeouts(transaction, true);
        await dropIndex(transaction, index.name);
        for (const statement of affected) {
          const entry: WhatIf["statements"][number] = {
            key: statement.key,
            cost_before: statement.plan!.total_cost,
          };
          try {
            // A failed EXPLAIN must not abort the other checks in this transaction.
            entry.plan_after = await transaction.savepoint(async (savepoint) =>
              summarizePlan(await explain(savepoint, statement.query)),
            );
          } catch (error) {
            entry.error = errorMessage(error);
          }
          result.statements.push(entry);
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) result.error = errorMessage(error);
    }
    whatIf.push(result);
  }
  const plans: Plans = {
    captured_at: new Date().toISOString(),
    database: info.database,
    stats_reset: info.stats_reset,
    statements_reset: info.statements_reset,
    statements: baseline,
    what_if: whatIf,
  };
  await writeJson("plans.json", plans);
  console.log(
    `Saved plans.json: ${baseline.length} statements, ${baseline.filter((s) => s.error).length} EXPLAIN errors, ${whatIf.length} rolled-back index checks.`,
  );
} finally {
  await sql.close();
}

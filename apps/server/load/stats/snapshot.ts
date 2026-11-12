import { indexStatistics, metadata, statementStatistics, tableStatistics } from "./catalog";
import type { Snapshot } from "./catalog";
import { connect, labelArgument, writeJson } from "./connection";

const label = labelArgument();
const sql = connect();
try {
  const captured_at = new Date().toISOString();
  const statements = await statementStatistics(sql);
  // Read counters before exact counts, which can themselves scan tables and indexes.
  const indexes = await indexStatistics(sql);
  const tables = await tableStatistics(sql);
  const snapshot: Snapshot = {
    captured_at,
    metadata: await metadata(sql),
    indexes,
    tables,
    statements,
  };
  await writeJson(`snapshot-${label}.json`, snapshot);
  console.log(
    `Saved snapshot-${label}.json: ${tables.length} tables, ${indexes.length} indexes, ${statements.length} statements.`,
  );
} finally {
  await sql.close();
}

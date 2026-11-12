import { clearStatistics, metadata, resetStatistics, tableStatistics } from "./catalog";
import { connect, writeJson } from "./connection";

const sql = connect();
try {
  await resetStatistics(sql);
  const tables = await tableStatistics(sql);
  // Do not count our exact row-count scans as measured workload activity.
  await clearStatistics(sql);
  const baseline = {
    captured_at: new Date().toISOString(),
    metadata: await metadata(sql),
    tables: tables.map((table) => ({ table: table.table, rows: table.exact_rows })),
  };
  await writeJson("baseline.json", baseline);
  console.table(baseline.tables);
  console.log(`Reset statistics; ${tables.length} tables. Saved baseline.json.`);
} finally {
  await sql.close();
}

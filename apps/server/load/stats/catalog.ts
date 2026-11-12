import type { SQL } from "bun";

type Client = Pick<SQL, "unsafe">;

export interface IndexStats {
  table: string;
  name: string;
  method: string;
  definition: string;
  primary: boolean;
  unique: boolean;
  constraint_name: string | null;
  constraint_type: string | null;
  fk_target: boolean;
  foreign_keys: string[];
  predicate: string | null;
  columns: string[];
  key_columns: string[];
  key_attributes: string[];
  size_bytes: number;
  idx_scan: number;
  idx_tup_read: number;
  idx_tup_fetch: number;
  last_idx_scan: string | null;
}

export interface TableStats {
  table: string;
  n_live_tup: number;
  exact_rows: number;
  seq_scan: number;
  seq_tup_read: number;
  idx_scan: number;
  idx_tup_fetch: number;
  n_tup_ins: number;
  n_tup_upd: number;
  n_tup_del: number;
  n_tup_hot_upd: number;
  table_size_bytes: number;
  heap_size_bytes: number;
  index_size_bytes: number;
}

export interface StatementStats {
  key: string;
  userid: number;
  dbid: number;
  queryid: string;
  toplevel: boolean;
  query: string;
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
}

export interface Metadata {
  database: string;
  version: string;
  stats_reset: string | null;
  statements_reset: string | null;
  block_size: number;
}

export interface Snapshot {
  captured_at: string;
  metadata: Metadata;
  indexes: IndexStats[];
  tables: TableStats[];
  statements: StatementStats[];
}

export const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

export async function resetStatistics(sql: Client) {
  await sql.unsafe("/* load-stats */ ANALYZE");
  await clearStatistics(sql);
}

export async function clearStatistics(sql: Client) {
  await sql.unsafe("/* load-stats */ SELECT pg_stat_force_next_flush()");
  await sql.unsafe("/* load-stats */ SELECT pg_stat_reset()");
  await sql.unsafe("/* load-stats */ SELECT pg_stat_statements_reset()");
}

export async function metadata(sql: Client): Promise<Metadata> {
  const [row] = await sql.unsafe<Metadata[]>(`/* load-stats */
    SELECT current_database() AS database, version(),
      d.stats_reset::text, s.stats_reset::text AS statements_reset,
      current_setting('block_size')::int AS block_size
    FROM pg_stat_database d CROSS JOIN pg_stat_statements_info s
    WHERE d.datname = current_database()`);
  if (!row) throw new Error("Database statistics are unavailable.");
  return row;
}

export async function indexStatistics(sql: Client): Promise<IndexStats[]> {
  return sql.unsafe<IndexStats[]>(`/* load-stats */
    SELECT t.relname AS table, i.relname AS name, am.amname AS method,
      pg_get_indexdef(i.oid) AS definition, x.indisprimary AS primary,
      x.indisunique AS unique, backing.conname AS constraint_name,
      backing.contype::text AS constraint_type,
      EXISTS (SELECT 1 FROM pg_constraint f WHERE f.contype = 'f'
        AND f.conindid = i.oid) AS fk_target,
      ARRAY(SELECT format('%I.%I.%I', fn.nspname, ft.relname, f.conname)
        FROM pg_constraint f JOIN pg_class ft ON ft.oid = f.conrelid
        JOIN pg_namespace fn ON fn.oid = ft.relnamespace
        WHERE f.contype = 'f' AND f.conindid = i.oid ORDER BY f.conname) AS foreign_keys,
      pg_get_expr(x.indpred, x.indrelid) AS predicate,
      ARRAY(SELECT pg_get_indexdef(i.oid, k, true)
        FROM generate_series(1, x.indnatts) k) AS columns,
      ARRAY(SELECT pg_get_indexdef(i.oid, k, true)
        FROM generate_series(1, x.indnkeyatts) k) AS key_columns,
      ARRAY(SELECT format('%s:%s:%s:%s', x.indclass[k], x.indcollation[k],
        x.indoption[k], pg_get_indexdef(i.oid, k + 1, true))
        FROM generate_series(0, x.indnkeyatts - 1) k) AS key_attributes,
      pg_relation_size(i.oid)::float8 AS size_bytes,
      coalesce(s.idx_scan, 0)::float8 AS idx_scan,
      coalesce(s.idx_tup_read, 0)::float8 AS idx_tup_read,
      coalesce(s.idx_tup_fetch, 0)::float8 AS idx_tup_fetch,
      s.last_idx_scan::text
    FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_am am ON am.oid = i.relam
    LEFT JOIN pg_stat_all_indexes s ON s.indexrelid = i.oid
    LEFT JOIN pg_constraint backing ON backing.conindid = i.oid
      AND backing.contype IN ('p', 'u', 'x')
    WHERE n.nspname = 'public' ORDER BY t.relname, i.relname`);
}

export async function tableStatistics(sql: Client): Promise<TableStats[]> {
  const tables = await sql.unsafe<TableStats[]>(`/* load-stats */
    SELECT relname AS table, n_live_tup::float8, seq_scan::float8, seq_tup_read::float8,
      coalesce(idx_scan, 0)::float8 AS idx_scan,
      coalesce(idx_tup_fetch, 0)::float8 AS idx_tup_fetch,
      n_tup_ins::float8, n_tup_upd::float8, n_tup_del::float8, n_tup_hot_upd::float8,
      pg_table_size(relid)::float8 AS table_size_bytes,
      pg_relation_size(relid)::float8 AS heap_size_bytes,
      pg_indexes_size(relid)::float8 AS index_size_bytes
    FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`);
  for (const table of tables) {
    const [count] = await sql.unsafe<{ count: number }[]>(
      `/* load-stats */ SELECT count(*)::float8 AS count FROM public.${quoteIdentifier(table.table)}`,
    );
    table.exact_rows = count!.count;
  }
  return tables;
}

export async function statementStatistics(sql: Client): Promise<StatementStats[]> {
  const statements = await sql.unsafe<StatementStats[]>(`/* load-stats */
    SELECT userid::int, dbid::int, queryid::text, toplevel, query,
      calls::float8, total_exec_time, mean_exec_time, rows::float8,
      shared_blks_hit::float8, shared_blks_read::float8
    FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database
      WHERE datname = current_database())
      AND position('/* load-stats */' IN query) = 0`);
  return statements.filter((statement) => {
    statement.key = `${statement.userid}:${statement.dbid}:${statement.queryid}:${statement.toplevel}`;
    const query = statement.query.replace(/^(\s|\/\*[\s\S]*?\*\/|--[^\n]*(?:\n|$))*/, "");
    return /^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(query);
  });
}

export async function explain(sql: Client, query: string): Promise<unknown> {
  const [row] = await sql.unsafe(`/* load-stats */ EXPLAIN (GENERIC_PLAN, FORMAT JSON) ${query}`);
  return row["QUERY PLAN"];
}

export async function setPlanTimeouts(sql: Client, local = false) {
  await sql.unsafe(`/* load-stats */ SET ${local ? "LOCAL " : ""}lock_timeout = '1s'`);
  await sql.unsafe(`/* load-stats */ SET ${local ? "LOCAL " : ""}statement_timeout = '5s'`);
}

export async function dropIndex(sql: Client, name: string) {
  await sql.unsafe(`/* load-stats */ DROP INDEX public.${quoteIdentifier(name)}`);
}

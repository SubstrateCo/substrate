import { sql, type SQLWrapper } from "drizzle-orm";

// Search expressions shared by the GIN indexes and the queries that use them. PostgreSQL uses an
// expression index only when the query repeats the indexed expression, so both import these.

/** Word index over text, without stemming. */
export function searchDocument(...columns: SQLWrapper[]) {
  return sql`to_tsvector('simple', ${sql.join(columns, sql` || ' ' || `)})`;
}

/** Trigram index key for case-insensitive substring search. Needs pg_trgm. */
export function trigramKey(column: SQLWrapper) {
  return sql`lower(${column})`;
}

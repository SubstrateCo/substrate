import { sql, type SQLWrapper } from "drizzle-orm";

// Search expressions shared by the GIN indexes and the queries that use them. PostgreSQL uses an
// expression index only when the query repeats the indexed expression, so both import these.

// PostgreSQL's text parser joins some punctuation to words: "-7" is a signed number, "v1.2.3" a
// file name, "a@b.com" an address, and "<b>" a tag that is dropped. Replacing ASCII punctuation
// with spaces first makes every part its own word, so "7" finds "note-7".
// The four ranges are all ASCII punctuation by code point, so the result does not depend on the
// database locale. Drizzle Kit cannot store an index expression that contains ";".
const punctuation = sql.raw("'[!-/:-@[-`{-~]'");

export function searchDocument(...columns: SQLWrapper[]) {
  return sql`to_tsvector('simple', regexp_replace(${sql.join(columns, sql` || ' ' || `)}, ${punctuation}, ' ', 'g'))`;
}

export function trigramKey(column: SQLWrapper) {
  return sql`lower(${column})`;
}

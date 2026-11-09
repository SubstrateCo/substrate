import { sql } from "drizzle-orm";

/** A SQL list of constant strings for check constraints. Only pass code-defined values. */
export const checkValues = (list: readonly string[]) =>
  sql.raw(list.map((value) => `'${value}'`).join(", "));

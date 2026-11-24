import { newId } from "@substrate/contracts/ids";

import { sql } from "drizzle-orm";
import { uuid } from "drizzle-orm/pg-core";

/**
 * A time-ordered UUIDv7 primary key. The application generates it; the database default covers
 * inserts written as SQL, such as INSERT ... SELECT.
 */
export const idColumn = (name = "id") =>
  uuid(name)
    .primaryKey()
    .default(sql`uuidv7()`)
    .$defaultFn(newId);

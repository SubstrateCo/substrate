import { newId } from "@substrate/contracts/ids";

import { sql } from "drizzle-orm";
import { uuid } from "drizzle-orm/pg-core";

export const idColumn = (name = "id") =>
  uuid(name)
    .primaryKey()
    .default(sql`uuidv7()`)
    .$defaultFn(newId);

import { createDatabase } from "@substrate/database/trusted";

import { environment } from "../environment";

export const { db, close: closeDatabase } = createDatabase({
  connectionString: environment.databaseURL,
});

import { createDatabase } from "@startup-os/database";

import { environment } from "../environment";

export const { db, close: closeDatabase } = createDatabase({
  connectionString: environment.databaseURL,
});

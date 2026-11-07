import { createDatabase } from "@startup-os/database";

import { authEnvironment } from "./environment";

export const { db, close: closeDatabase } = createDatabase({
  connectionString: authEnvironment().databaseURL,
});

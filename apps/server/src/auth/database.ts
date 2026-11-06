import { createDatabase } from "@startup-os/database";

import { authEnvironment } from "./environment";

export const { db } = createDatabase({ connectionString: authEnvironment().databaseURL });

import { createDatabase } from "@substrate/database/trusted";

import { environment } from "../environment";

export function createServerDatabase() {
  return createDatabase({ connectionString: environment.databaseURL });
}

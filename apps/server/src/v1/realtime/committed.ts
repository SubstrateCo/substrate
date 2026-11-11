import type { Committed } from "@substrate/database";

import { deliverSharingMail } from "../messaging/sharing-mail";
import { publishRefresh } from "./publisher";

export async function publishCommitted<T>(committed: Committed<T>): Promise<T> {
  await publishRefresh(committed.hints);
  if (committed.mail?.includes("sharing")) await deliverSharingMail();
  return committed.result;
}

import { committedWrite } from "../../../core/effects";
import type { Committed } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import * as connections from "./connections";
import * as mail from "./mail";

export async function claimSharingMail(
  db: DatabaseExecutor,
): Promise<Committed<Awaited<ReturnType<typeof mail.claimSharingMail>>>> {
  return { result: await mail.claimSharingMail(db), hints: [] };
}
export const finishSharingMail = committedWrite(mail.finishSharingMail);
export const clearMembershipSharing = committedWrite(
  connections.clearMembershipSharingInTransaction,
);

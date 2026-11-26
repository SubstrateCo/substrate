import { commit } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import { sweepExpiredLeases } from "./lease";

/**
 * Ends the live turns of hosts that went away, for every owner. Trusted: the server's periodic
 * worker runs it. Returns how many turns ended, and the hints to publish after commit.
 */
export function sweepAgentLeases(db: DatabaseExecutor, now = new Date()) {
  return commit(db, (tx) => sweepExpiredLeases(tx, now));
}

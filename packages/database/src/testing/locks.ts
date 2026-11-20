import { monitorDatabase } from "./connection";
import { sql } from "drizzle-orm";

/**
 * Waits until `count` connections to the test database wait for a lock. Database tests run
 * serially, so these are the test's own queries. This proves that work is blocked, where a fixed
 * delay only assumes it. Fails after about two seconds.
 */
export async function waitForLockWaiters(count = 1) {
  let waiting = 0;
  for (let attempt = 0; attempt < 200; attempt++) {
    const [row] = await monitorDatabase.execute<{ waiting: number }>(
      sql`SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`,
    );
    waiting = row!.waiting;
    if (waiting >= count) return;
    await Bun.sleep(10);
  }
  throw new Error(`Expected ${count} connections to wait for a lock; ${waiting} did.`);
}

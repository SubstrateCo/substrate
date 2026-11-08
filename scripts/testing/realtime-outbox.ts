import { createDatabase } from "../../packages/database/src/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith("_test"))
  throw new Error("Realtime readiness requires the test runner's dedicated database.");
const connection = createDatabase({ connectionString, maxConnections: 1 });
try {
  const snapshot = await connection.db.query.realtimeOutbox.findMany({ columns: { id: true } });
  const ids = snapshot.map((row) => row.id);
  const deadline = Date.now() + 15_000;
  let pending = snapshot;
  while (pending.length) {
    if (Date.now() >= deadline)
      throw new Error(`${pending.length} seeded realtime changes were not acknowledged.`);
    await Bun.sleep(25);
    pending = await connection.db.query.realtimeOutbox.findMany({
      columns: { id: true },
      where: (outbox, { inArray }) => inArray(outbox.id, ids),
    });
  }
} finally {
  await connection.close();
}

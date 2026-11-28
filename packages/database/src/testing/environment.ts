export function testDatabaseURL(env: Record<string, string | undefined> = process.env) {
  if (env.BUN_TEST_WORKER_ID && !env.TEST_DATABASE_WORKER_URLS)
    throw new Error(
      "Parallel test workers need their own databases. Run bun run test from packages/database.",
    );
  const connectionString =
    env.TEST_DATABASE_WORKER_URLS && env.BUN_TEST_WORKER_ID
      ? env.TEST_DATABASE_WORKER_URLS.split(" ")[Number(env.BUN_TEST_WORKER_ID) - 1]
      : env.TEST_DATABASE_URL;
  if (!connectionString)
    throw new Error("TEST_DATABASE_URL is required. Use the dedicated test database.");
  const url = new URL(connectionString);
  if (!url.pathname.endsWith("_test")) throw new Error("The test database name must end in _test.");
  if (env.DATABASE_URL && connectionString === env.DATABASE_URL) {
    throw new Error("Tests must not use DATABASE_URL.");
  }
  return url;
}

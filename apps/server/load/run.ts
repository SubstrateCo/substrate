import { baselineEnvironment } from "./run-environment";
import { baselinePaths } from "./run-paths";
import { stopChild } from "./run-process";
import { mkdir, copyFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";

const label = `baseline-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const { root, data, directory } = baselinePaths(import.meta.url, label);
const api = "http://localhost:3201";
const docker = ["docker", "--context", "default"];
const compose = [
  ...docker,
  "compose",
  "--file",
  `${root}/compose.yaml`,
  "--project-name",
  "startup-os",
];
if (process.argv.slice(2).join(" ") !== "--fresh")
  throw new Error("Use --fresh to confirm replacing only the isolated substrate_load database.");

const env = baselineEnvironment(process.env);
await mkdir(directory, { recursive: true });
const startedAt = new Date().toISOString();
let stage = "setup";
let status = "failed";
let failure: string | undefined;
let failureStage: string | undefined;
let cancelled = false;
let active: ReturnType<typeof Bun.spawn> | undefined;
let server: ReturnType<typeof Bun.spawn> | undefined;
const collectionErrors: string[] = [];
let interrupt: (() => void) | undefined;
const interrupted = new Promise<void>((resolve) => {
  interrupt = resolve;
});
const revision = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root })
  .stdout.toString()
  .trim();

function cancel() {
  cancelled = true;
  interrupt?.();
  active?.kill();
  server?.kill();
}
process.on("SIGINT", cancel);
process.on("SIGTERM", cancel);

async function sourceSnapshot(save = false) {
  const listing = Bun.spawnSync(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root },
  );
  if (listing.exitCode !== 0) throw new Error("Could not list source files.");
  const paths = listing.stdout.toString().split("\0").filter(Boolean).sort();
  const hash = new Bun.CryptoHasher("sha256");
  const source: Record<string, string> = {};
  for (const path of paths) {
    if (!/\.(ts|tsx|json|yaml|sql)$/.test(path) && path !== "bun.lock") continue;
    const file = Bun.file(`${root}/${path}`);
    if (!(await file.exists())) continue;
    const text = await file.text();
    hash.update(`${path}\0${text}\0`);
    if (save) source[path] = text;
  }
  if (save) {
    await Bun.write(`${directory}/source-files.json`, JSON.stringify(source));
    await Bun.write(
      `${directory}/source.patch`,
      Bun.spawnSync(["git", "diff", "HEAD", "--binary"], { cwd: root }).stdout,
    );
  }
  return hash.digest("hex");
}
let sourceDigest: string | undefined;
await Bun.write(
  `${directory}/manifest.json`,
  JSON.stringify({ label, status: "running", stage, startedAt, revision, sourceDigest }, null, 2),
);

async function command(name: string, args: string[], evidence = false) {
  if (!evidence) checkCancellation();
  stage = name;
  console.log(`[${new Date().toISOString()}] ${name}`);
  const child = Bun.spawn(args, {
    cwd: root,
    env,
    stdin: "ignore",
    stdout: Bun.file(`${directory}/${name}.out.log`),
    stderr: Bun.file(`${directory}/${name}.err.log`),
  });
  active = child;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      watchdog = setTimeout(
        () => reject(new Error(`${name} timed out.`)),
        evidence ? 60_000 : 25 * 60_000,
      );
    });
    const exit = Promise.race([child.exited, timeout]);
    const code = await (evidence
      ? exit
      : Promise.race([
          exit,
          interrupted.then(() => {
            throw new Error("Baseline cancelled.");
          }),
        ]));
    if (!evidence) checkCancellation();
    if (code !== 0) throw new Error(`${name} failed (${code}); see ${directory}/${name}.err.log`);
  } catch (error) {
    if (!evidence) failureStage ??= name;
    await collect(`${name} shutdown`, () => stopChild(child));
    throw error;
  } finally {
    clearTimeout(watchdog);
    active = undefined;
  }
}

function checkCancellation() {
  if (cancelled) throw new Error("Baseline cancelled.");
}

function cancellationRequested() {
  return cancelled;
}

async function collect(name: string, action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    collectionErrors.push(`${name}: ${String(error)}`);
  }
}

async function metrics(name: string, reset = false) {
  const response = await fetch(`${api}/internal/metrics${reset ? "?reset=1" : ""}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Server metrics failed: ${response.status}`);
  await Bun.write(`${directory}/${name}.json`, await response.text());
}

async function k6(mode: string) {
  const executable = process.platform === "win32" ? `${data}/../.bin/k6.exe` : "k6";
  const output = `${data}/k6-summary-${mode}.json`;
  if (await Bun.file(output).exists()) await Bun.file(output).delete();
  try {
    await command(mode, [
      executable,
      "run",
      "--quiet",
      "-e",
      `MODE=${mode}`,
      "apps/server/load/k6/main.ts",
    ]);
  } finally {
    if (await Bun.file(output).exists()) await copyFile(output, `${directory}/${mode}.json`);
  }
}

// A live server could hold old prepared statements or be somebody else's process.
// Fail before touching the database; the caller must stop it deliberately.
try {
  stage = "source-capture";
  sourceDigest = await sourceSnapshot(true);
  checkCancellation();
  const port = Bun.listen({ hostname: "127.0.0.1", port: 3201, socket: { data() {} } });
  port.stop(true);
  const context = Bun.spawnSync(
    [...docker, "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
    { env, cwd: root },
  );
  const endpoint = context.stdout.toString().trim();
  if (context.exitCode !== 0 || !/^(npipe:\/\/|unix:\/\/)/.test(endpoint))
    throw new Error(
      "The baseline requires a local Docker default context (named pipe or Unix socket).",
    );
  await command("services", [
    ...compose,
    "--profile",
    "load",
    "up",
    "-d",
    "--wait",
    "postgres-load",
    "valkey-load",
    "mailpit-load",
    "s3-load",
    "s3-load-init",
  ]);
  await command("docker-version", [...docker, "version"]);
  await command("k6-version", [
    process.platform === "win32" ? `${data}/../.bin/k6.exe` : "k6",
    "version",
  ]);
  await command("service-images", [...compose, "--profile", "load", "images"]);
  await command("fresh-database", [
    ...compose,
    "exec",
    "-T",
    "postgres-load",
    "psql",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "substrate_load",
    "-d",
    "postgres",
    "-c",
    "DROP DATABASE IF EXISTS substrate_load WITH (FORCE)",
    "-c",
    "CREATE DATABASE substrate_load OWNER substrate_load",
  ]);
  await command("fresh-cache", [...compose, "exec", "-T", "valkey-load", "valkey-cli", "FLUSHALL"]);
  stage = "fresh-mail";
  const clearMail = await fetch("http://localhost:8026/api/v1/messages", {
    method: "DELETE",
    signal: AbortSignal.timeout(10_000),
  });
  if (!clearMail.ok) throw new Error(`Could not clear load-only mail: ${clearMail.status}`);
  server = Bun.spawn([process.execPath, "--no-env-file", "apps/server/scripts/start-load.ts"], {
    cwd: root,
    env,
    stdin: "ignore",
    stdout: Bun.file(`${directory}/server.out.log`),
    stderr: Bun.file(`${directory}/server.err.log`),
  });
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (server.exitCode !== null) throw new Error("Load server exited during startup.");
    const ready = await fetch(`${api}/api/auth/ok`, { signal: AbortSignal.timeout(2_000) }).then(
      (r) => r.ok,
      () => false,
    );
    if (ready) break;
    if (Date.now() >= deadline) throw new Error("Load server startup timed out.");
    await Bun.sleep(500);
  }
  await command("provision", [process.execPath, "--no-env-file", "apps/server/load/provision.ts"]);
  await copyFile(`${data}/users.json`, `${directory}/users.json`);
  await command("preflight", [process.execPath, "--no-env-file", "apps/server/load/preflight.ts"]);
  const k6Executable = process.platform === "win32" ? `${data}/../.bin/k6.exe` : "k6";
  for (const name of ["crm", "discussions"]) {
    await command(`${name}-contracts`, [
      k6Executable,
      "run",
      "--quiet",
      "--summary-export",
      `${directory}/${name}-contracts.json`,
      "-e",
      "CRM_SMOKE_CONFIRM=substrate_load",
      `apps/server/load/k6/${name}-smoke.ts`,
    ]);
  }
  // Warm caches before either evidence window; never blend seeding with measured reads.
  await k6("warmup");
  await command("reset-coverage", [
    process.execPath,
    "--no-env-file",
    "apps/server/load/stats/reset.ts",
  ]);
  await k6("coverage");
  await command("snapshot-coverage", [
    process.execPath,
    "--no-env-file",
    "apps/server/load/stats/snapshot.ts",
    `${label}-coverage`,
  ]);
  await copyFile(`${data}/snapshot-${label}-coverage.json`, `${directory}/indexes-coverage.json`);
  await command("reset-measure", [
    process.execPath,
    "--no-env-file",
    "apps/server/load/stats/reset.ts",
  ]);
  await copyFile(`${data}/baseline.json`, `${directory}/database-before.json`);
  await metrics("server-before", true);
  try {
    await k6("measure");
  } finally {
    await collect("server metrics", () => metrics("server-after"));
    await collect("database snapshot", async () => {
      await command(
        "snapshot",
        [process.execPath, "--no-env-file", "apps/server/load/stats/snapshot.ts", label],
        true,
      );
      await copyFile(`${data}/snapshot-${label}.json`, `${directory}/indexes-measure.json`);
    });
    await collect("index report", async () => {
      await command(
        "index-report",
        [process.execPath, "--no-env-file", "apps/server/load/stats/report.ts", label],
        true,
      );
      await copyFile(`${data}/report-${label}.md`, `${directory}/indexes.md`);
    });
  }
  if (collectionErrors.length) throw new Error(collectionErrors.join("\n"));
  status = "passed";
} catch (error) {
  failure = String(error);
  failureStage ??= stage;
  throw error;
} finally {
  const runningServer = server;
  if (runningServer) await collect("server shutdown", () => stopChild(runningServer));
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
  let sourceChanged = false;
  try {
    sourceChanged = (await sourceSnapshot()) !== sourceDigest;
  } catch (error) {
    collectionErrors.push(`source verification: ${String(error)}`);
  }
  if (sourceChanged) status = "invalid (source changed during run)";
  if (collectionErrors.length) status = "failed";
  if (cancellationRequested()) status = "cancelled";
  await Bun.write(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        label,
        status,
        stage,
        failure,
        failureStage,
        collectionErrors,
        sourceDigest,
        sourceChanged,
        startedAt,
        finishedAt: new Date().toISOString(),
        revision,
        bun: Bun.version,
        platform: process.platform,
        architecture: process.arch,
        cpu: cpus()[0]?.model,
        logicalProcessors: cpus().length,
        memoryBytes: totalmem(),
        databasePoolSize: 10,
        users: 200,
        freshDatabase: true,
        measurement: { ramp: "2m", hold: "12m", pace: 1 },
        warmup: { users: 20, ramp: "30s", hold: "2m" },
        coverage: { users: 8, maxDuration: "10m" },
        thresholds: { apiP95Ms: 1000, apiP99Ms: 3000 },
      },
      null,
      2,
    ),
  );
  console.log(`Baseline ${status}: ${directory}`);
  if (status !== "passed") process.exitCode = 1;
}

import { createEvalDatabase } from "./database.ts";
import { grade, markdown, summarize, type GradedRun, type ModelSummary } from "./report.ts";
import { runDirectory, runScenario, type ModelTarget } from "./runner.ts";
import { scenarios } from "./scenarios.ts";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const targets: ModelTarget[] = [
  { label: "opus", harness: "claude", model: "opus" },
  { label: "sonnet", harness: "claude", model: "sonnet" },
  { label: "sol", harness: "opencode", model: "openai/gpt-6.1-sol" },
  { label: "terra", harness: "opencode", model: "openai/gpt-6.1-terra" },
];
const known = targets.map((target) => target.label).join(", ");

const { values } = parseArgs({
  options: {
    label: { type: "string", default: "run" },
    models: { type: "string", default: targets.map((target) => target.label).join(",") },
    scenarios: { type: "string" },
    concurrency: { type: "string", default: "6" },
    repeat: { type: "string", default: "1" },
    compare: { type: "string" },
  },
});

const root = resolve(import.meta.dirname, "../../../.runtime/evals");
const out = join(root, values.label);
const picked = values.models.split(",").map((name) => {
  const target = targets.find((entry) => entry.label === name.trim());
  if (!target) throw new Error(`Unknown model ${name}. Known: ${known}.`);
  return target;
});
const wanted = values.scenarios?.split(",").map((id) => id.trim());
const chosen = wanted ? scenarios.filter((entry) => wanted.includes(entry.id)) : scenarios;
if (!chosen.length) throw new Error("No scenario matches.");

// Agent folders live outside the repository, as on a desktop: harnesses read instruction files
// from parent folders. An empty config home keeps the developer's own global agent rules out.
const accounts = join(tmpdir(), "substrate-evals", `${values.label}-${Date.now()}`);
const configHome = join(accounts, "_config");
await mkdir(configHome, { recursive: true });
process.env.XDG_CONFIG_HOME = configHome;
// A harness started from another agent session must not inherit that session.
for (const name of Object.keys(process.env))
  if (/^(OPENCODE|CLAUDE_AGENT_SDK|CLAUDECODE|CLAUDE_CODE)/.test(name)) delete process.env[name];
await mkdir(join(out, "runs"), { recursive: true });

const database = await createEvalDatabase();
const jobs = chosen.flatMap((scenario) =>
  picked.flatMap((target) =>
    Array.from({ length: Number(values.repeat) }, (_, index) => ({ scenario, target, index })),
  ),
);
const graded: GradedRun[] = [];
let next = 0;
async function worker() {
  for (;;) {
    const job = jobs.at(next++);
    if (!job) return;
    const { scenario, target, index } = job;
    const directory = await runDirectory(accounts, scenario.id, target.label);
    const { record, world, close } = await runScenario(database.db, directory, scenario, target);
    let checks: GradedRun["checks"] = [];
    if (world && !record.error)
      try {
        checks = await scenario.check(world, record);
      } catch (error) {
        record.error = `check failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    await close().catch(() => {});
    const result = grade(scenario, record, checks);
    graded.push(result);
    await writeFile(
      join(out, "runs", `${scenario.id}.${target.label}.${index}.json`),
      JSON.stringify(result, null, 2),
    );
    const failed = result.checks.filter((entry) => !entry.pass).map((entry) => entry.name);
    console.log(
      `${result.success ? "PASS" : "FAIL"} ${scenario.id} / ${target.label}  ${result.calls} calls, ${result.errors} failed, ${result.seconds}s${result.error ? `  ERROR ${result.error}` : ""}${failed.length ? `  [${failed.join("; ")}]` : ""}`,
    );
  }
}
try {
  await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));
} finally {
  await database.close();
  await rm(accounts, { recursive: true, force: true }).catch(() => {});
}

const stored: GradedRun[] = [];
for (const file of await readdir(join(out, "runs")))
  stored.push(JSON.parse(await readFile(join(out, "runs", file), "utf8")));
graded.length = 0;
graded.push(...stored);
graded.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.model.localeCompare(b.model));
let previous: { summary: ModelSummary[]; scenarios: string[] } | undefined;
if (values.compare) {
  const before = join(root, values.compare);
  const ran = (await readdir(join(before, "runs"))).map((file) => file.split(".").at(0) ?? "");
  previous = {
    summary: JSON.parse(await readFile(join(before, "summary.json"), "utf8")),
    scenarios: [...new Set(ran)],
  };
}
const summary = summarize(graded);
await writeFile(join(out, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(join(out, "summary.md"), markdown(values.label, graded, previous));
console.log(`\n${markdown(values.label, graded, previous).split("## By scenario")[0]}`);
console.log(`Report: ${join(out, "summary.md")}`);
process.exit(0);

import type { GradedRun } from "./report.ts";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const [label, scenario, model] = process.argv.slice(2);
if (!label) throw new Error("Usage: trace.ts <label> [scenario] [model]");
const directory = resolve(import.meta.dirname, "../../../.runtime/evals", label, "runs");
const clip = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length)}…` : text;
for (const file of (await readdir(directory)).sort()) {
  const [fileScenario, fileModel] = file.split(".");
  if (scenario && fileScenario !== scenario) continue;
  if (model && fileModel !== model) continue;
  const run: GradedRun = JSON.parse(await readFile(join(directory, file), "utf8"));
  console.log(
    `\n##### ${run.scenario} / ${run.model}  ${run.success ? "PASS" : "FAIL"}  ${run.calls} calls${run.error ? `  ERROR ${run.error}` : ""}`,
  );
  for (const entry of run.checks.filter((candidate) => !candidate.pass))
    console.log(`  ✗ ${entry.name}`);
  for (const [index, turn] of run.record.turns.entries()) {
    console.log(`  -- turn ${index + 1}: ${turn.status}, ${Math.round(turn.ms / 1000)}s`);
    const native = turn.nativeItems.map((item) => item.title);
    console.log(`  harness: ${native.join(" | ")}`);
    if (turn.permissionPrompts.length)
      console.log(`  prompts: ${turn.permissionPrompts.join(" | ")}`);
    for (const call of turn.calls)
      console.log(
        `  ${call.ok ? " " : "!"} ${call.tool} ${clip(JSON.stringify(call.input), 260)} -> ${call.ok ? `${call.bytes}b` : `${call.code}: ${call.message}`}`,
      );
    if (turn.text.trim())
      console.log(`  private: ${clip(turn.text.trim().replaceAll("\n", " "), 300)}`);
  }
  for (const reply of run.record.replies)
    console.log(`  REPLY: ${clip(reply.replaceAll("\n", " ⏎ "), 900)}`);
  for (const question of run.record.questions) console.log(`  ASKED: ${question}`);
}

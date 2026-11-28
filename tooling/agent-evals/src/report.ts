import type { RunRecord } from "./runner.ts";
import type { Check, Scenario } from "./scenario.ts";

export interface GradedRun {
  scenario: string;
  model: string;
  success: boolean;
  checks: Check[];
  calls: number;
  errors: number;
  rejected?: number;
  nativeCalls: number;
  permissionPrompts: number;
  questions: number;
  efficiency: number;
  inputTokens: number;
  outputTokens: number;
  seconds: number;
  error?: string;
  record: RunRecord;
}

export function grade(scenario: Scenario, record: RunRecord, checks: Check[]): GradedRun {
  const calls = record.turns.flatMap((turn) => turn.calls);
  const native = record.turns.reduce((sum, turn) => sum + turn.nativeItems.length, 0);
  const failed = calls.filter((call) => !call.ok && call.code !== "APPROVAL_PENDING").length;
  const pending = calls.filter((call) => call.code === "APPROVAL_PENDING").length;
  const sum = (pick: (turn: RunRecord["turns"][number]) => number) =>
    record.turns.reduce((total, turn) => total + pick(turn), 0);
  const graded: GradedRun = {
    scenario: scenario.id,
    model: record.model,
    success: !record.error && checks.length > 0 && checks.every((entry) => entry.pass),
    checks,
    calls: calls.length,
    errors: failed,
    rejected: Math.max(0, sum((turn) => turn.nativeFailed.length) - failed - pending),
    nativeCalls: Math.max(0, native - calls.length),
    permissionPrompts: sum((turn) => turn.permissionPrompts.length),
    questions: record.questions.length,
    efficiency: Math.min(1, scenario.budget / Math.max(1, calls.length)),
    inputTokens: sum((turn) => turn.usage?.inputTokens ?? 0),
    outputTokens: sum((turn) => turn.usage?.outputTokens ?? 0),
    seconds: Math.round(sum((turn) => turn.ms) / 1000),
    record,
  };
  if (record.error) graded.error = record.error.split("\n").at(0);
  return graded;
}

const mean = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const fixed = (value: number) => value.toFixed(1);

export interface ModelSummary {
  model: string;
  runs: number;
  success: number;
  checks: number;
  calls: number;
  errors: number;
  rejected: number;
  nativeCalls: number;
  questions: number;
  efficiency: number;
  seconds: number;
}

export function summarize(runs: GradedRun[]): ModelSummary[] {
  const models = [...new Set(runs.map((run) => run.model))];
  const row = (model: string, of: GradedRun[]): ModelSummary => ({
    model,
    runs: of.length,
    success: mean(of.map((run) => (run.success ? 1 : 0))),
    checks: mean(
      of.map((run) =>
        run.checks.length ? run.checks.filter((entry) => entry.pass).length / run.checks.length : 0,
      ),
    ),
    calls: mean(of.map((run) => run.calls)),
    errors: mean(of.map((run) => run.errors)),
    rejected: mean(of.map((run) => run.rejected ?? 0)),
    nativeCalls: mean(of.map((run) => run.nativeCalls)),
    questions: mean(of.map((run) => run.questions)),
    efficiency: mean(of.map((run) => run.efficiency)),
    seconds: mean(of.map((run) => run.seconds)),
  });
  return [
    ...models.map((model) =>
      row(
        model,
        runs.filter((run) => run.model === model),
      ),
    ),
    row("all", runs),
  ];
}

export function markdown(
  label: string,
  runs: GradedRun[],
  previous?: { summary: ModelSummary[]; scenarios: string[] },
) {
  const lines = [`# Agent evals: ${label}`, ""];
  const compared = previous
    ? runs.filter((run) => previous.scenarios.includes(run.scenario))
    : runs;
  const added = runs.filter((run) => !compared.includes(run));
  const delta = (
    model: string,
    key: "success" | "calls" | "errors" | "efficiency",
    now: number,
  ) => {
    const before = previous?.summary.find((entry) => entry.model === model)?.[key];
    if (before === undefined) return "";
    const change = now - before;
    if (Math.abs(change) < 0.005) return " (=)";
    const sign = change > 0 ? "+" : "";
    return key === "success" || key === "efficiency"
      ? ` (${sign}${Math.round(change * 100)}pt)`
      : ` (${sign}${fixed(change)})`;
  };
  const table = (of: GradedRun[], change: typeof delta) => {
    lines.push(
      "| Model | Runs | Success | Checks passed | Tool calls | Failed calls | Rejected input | Harness tool calls | Questions | Efficiency | Seconds |",
      "|---|---|---|---|---|---|---|---|---|---|---|",
    );
    for (const entry of summarize(of))
      lines.push(
        `| ${entry.model} | ${entry.runs} | ${percent(entry.success)}${change(entry.model, "success", entry.success)} | ${percent(entry.checks)} | ${fixed(entry.calls)}${change(entry.model, "calls", entry.calls)} | ${fixed(entry.errors)}${change(entry.model, "errors", entry.errors)} | ${fixed(entry.rejected)} | ${fixed(entry.nativeCalls)} | ${fixed(entry.questions)} | ${percent(entry.efficiency)}${change(entry.model, "efficiency", entry.efficiency)} | ${Math.round(entry.seconds)} |`,
      );
  };
  table(compared, delta);
  if (added.length) {
    lines.push("", "### New scenarios, first measurement", "");
    table(added, () => "");
  }
  const models = [...new Set(runs.map((run) => run.model))];
  const scenarios = [...new Set(runs.map((run) => run.scenario))];
  lines.push(
    "",
    "## By scenario",
    "",
    `| Scenario | ${models.join(" | ")} |`,
    `|---|${models.map(() => "---").join("|")}|`,
  );
  for (const scenario of scenarios) {
    const cells = models.map((model) => {
      const of = runs.filter((run) => run.scenario === scenario && run.model === model);
      if (!of.length) return "";
      const passed = of.filter((run) => run.success).length;
      return `${passed}/${of.length} · ${fixed(mean(of.map((run) => run.calls)))} calls · ${fixed(mean(of.map((run) => run.errors)))} err`;
    });
    lines.push(`| ${scenario} | ${cells.join(" | ")} |`);
  }
  lines.push("", "## Failures", "");
  for (const run of runs.filter((entry) => !entry.success)) {
    lines.push(`- **${run.scenario} / ${run.model}**${run.error ? `: ${run.error}` : ""}`);
    for (const entry of run.checks.filter((candidate) => !candidate.pass))
      lines.push(
        `  - ${entry.name}${entry.detail ? `: \`${entry.detail.replaceAll("\n", " ").slice(0, 300)}\`` : ""}`,
      );
  }
  const failed = new Map<string, number>();
  for (const run of runs)
    for (const turn of run.record.turns)
      for (const call of turn.calls)
        if (!call.ok && call.code !== "APPROVAL_PENDING") {
          const key = `${call.tool} ${call.code}: ${call.message ?? ""}`.slice(0, 200);
          failed.set(key, (failed.get(key) ?? 0) + 1);
        }
  lines.push("", "## Failed tool calls", "");
  for (const [key, count] of [...failed].sort((a, b) => b[1] - a[1]))
    lines.push(`- ${count}× ${key}`);
  const used = new Map<string, number>();
  for (const run of runs)
    for (const turn of run.record.turns)
      for (const call of turn.calls) used.set(call.tool, (used.get(call.tool) ?? 0) + 1);
  lines.push("", "## Tool use", "");
  lines.push(
    [...used]
      .sort((a, b) => b[1] - a[1])
      .map(([tool, count]) => `${tool} ${count}`)
      .join(", "),
  );
  return `${lines.join("\n")}\n`;
}

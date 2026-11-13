import type { IndexStats, Snapshot, StatementStats, TableStats } from "./catalog";
import { connectionUrl, dataDirectory, labelArgument } from "./connection";
import { indexVerdict } from "./index-verdict";
import type { Plans } from "./plan-analysis";
import { findRedundancy } from "./redundancy";

const SMALL_TABLE_ROWS = 1_000;
const SMALL_TABLE_PAGES = 8;
const LOW_USE_SCAN_SHARE = 0.0001; // 0.01% of all index scans.
const MANY_SEQ_SCANS = 100;
const QUERY_TEXT_LIMIT = 200;

connectionUrl(); // Enforce the same database-name guard as the database scripts.
const label = labelArgument();
const snapshot: Snapshot = await Bun.file(`${dataDirectory}/snapshot-${label}.json`).json();
const expectedDatabase = process.env.LOAD_STATS_ALLOW_DB ?? "substrate_load";
if (snapshot.metadata.database !== expectedDatabase) {
  throw new Error(
    `Snapshot database is ${snapshot.metadata.database}; expected ${expectedDatabase}.`,
  );
}
let plans: Plans | undefined;
const plansFile = Bun.file(`${dataDirectory}/plans.json`);
if (await plansFile.exists()) {
  const captured: Plans = await plansFile.json();
  if (
    captured.database === snapshot.metadata.database &&
    captured.stats_reset === snapshot.metadata.stats_reset &&
    captured.statements_reset === snapshot.metadata.statements_reset
  ) {
    plans = captured;
  } else {
    console.warn(
      "Ignoring plans.json: database or statistics reset window differs from the snapshot.",
    );
  }
}

const tables = new Map(snapshot.tables.map((table) => [table.table, table]));
const coverageFile = Bun.file(`${dataDirectory}/snapshot-${label}-coverage.json`);
const coverage: Snapshot | undefined = (await coverageFile.exists())
  ? await coverageFile.json()
  : undefined;
if (coverage && coverage.metadata.database !== snapshot.metadata.database)
  throw new Error("Coverage and measurement databases differ.");
const coverageScans = new Map(coverage?.indexes.map((index) => [index.name, index.idx_scan]));
const statementPlans = new Map(plans?.statements.map((statement) => [statement.key, statement]));
const planUse = new Map<string, number>();
for (const statement of plans?.statements ?? []) {
  for (const index of statement.plan?.indexes ?? [])
    planUse.set(index, (planUse.get(index) ?? 0) + 1);
}
const totalCalls = snapshot.statements.reduce((sum, statement) => sum + statement.calls, 0);
const totalScans = snapshot.indexes.reduce((sum, index) => sum + index.idx_scan, 0);
const smallTable = (table: TableStats) =>
  table.exact_rows < SMALL_TABLE_ROWS ||
  table.heap_size_bytes < SMALL_TABLE_PAGES * snapshot.metadata.block_size;
function kind(index: IndexStats) {
  if (index.primary) return "primary";
  if (index.constraint_name) return "unique-constraint";
  return index.unique ? "unique-index" : "secondary";
}
function verdict(index: IndexStats) {
  const evidence = indexVerdict(
    index,
    tables.get(index.table)!,
    coverageScans.get(index.name),
    planUse.get(index.name),
    snapshot.metadata.block_size,
  );
  if (evidence !== "used") return evidence;
  if (
    totalScans > 0 &&
    index.idx_scan / totalScans < LOW_USE_SCAN_SHARE &&
    smallTable(tables.get(index.table)!)
  )
    return "low use";
  return "used";
}
type Cell = string | number | boolean | null | undefined;
const cell = (value: Cell) =>
  String(value ?? "—")
    .replaceAll("|", "\\|")
    .replace(/[\r\n]+/g, " ");
const number = (value: number, digits = 0) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });
const bytes = (value: number) => `${number(value / 1024, 1)} KiB`;
const ratio = (numerator: number, denominator: number, digits = 2) =>
  denominator ? number(numerator / denominator, digits) : "—";
const sections: string[] = [];
function table(headers: string[], rows: Cell[][]) {
  return [
    headers.map(cell).join(" | "),
    headers.map(() => "---").join(" | "),
    ...rows.map((row) => row.map(cell).join(" | ")),
  ]
    .map((line) => `| ${line} |`)
    .join("\n");
}

sections.push(`# Index usage: ${label}

Captured: ${snapshot.captured_at}. Database: ${snapshot.metadata.database}.
Stats window: ${snapshot.metadata.stats_reset ?? "unknown"} → ${snapshot.captured_at}.
Statement stats reset: ${snapshot.metadata.statements_reset ?? "unknown"}.
Statements: ${snapshot.statements.length}. Calls: ${number(totalCalls)}. Index scans: ${number(totalScans)}.
Indexes: ${snapshot.indexes.length}; secondary (non-unique, no backing constraint): ${snapshot.indexes.filter((index) => !index.unique && !index.primary && !index.constraint_name).length}; standalone unique indexes: ${snapshot.indexes.filter((index) => index.unique && !index.primary && !index.constraint_name).length}.

Small table: < ${SMALL_TABLE_ROWS} rows OR heap < ${SMALL_TABLE_PAGES} pages (${snapshot.metadata.block_size} bytes/page).
Low use: positive scans < ${LOW_USE_SCAN_SHARE * 100}% of total index scans AND small table.
Missing-index signal: ≥ ${MANY_SEQ_SCANS} sequential scans AND > ${SMALL_TABLE_ROWS} rows.
${plans ? `Generic plans: ${plans.statements.length}; EXPLAIN errors: ${plans.statements.filter((statement) => statement.error).length}.` : "No matching plans.json; generic-plan use is unknown."}
Coverage snapshot: ${coverage ? `${label}-coverage (separate from measured counters)` : "missing; no review candidates assigned"}.
Review candidates have zero scans in both windows, at least 1,000 rows, and measured table reads. They need repeated representative runs and query review, not automatic removal.

Generic plans are parameter-independent estimates, not execution evidence. Candidate labels are not permission to drop indexes. Failed EXPLAINs, uncaptured workloads, uniqueness, FK checks, INCLUDE columns, and ordering can change the decision. Run snapshot before plans, on an idle database. Exact row counts scan tables/indexes; reset clears its counting overhead before the run. Later snapshots include earlier snapshot-count overhead.`);

sections.push(
  "## INDEX TABLE\n\n" +
    table(
      [
        "Table",
        "Index",
        "Kind",
        "Method",
        "Partial?",
        "Size",
        "Rows",
        "Scans",
        "Tuples read",
        "Scans/1k calls",
        "Generic plans",
        "FK-target?",
        "Verdict",
        "Note",
      ],
      [...snapshot.indexes]
        .sort((a, b) => a.table.localeCompare(b.table) || a.name.localeCompare(b.name))
        .map((index) => {
          const tableStats = tables.get(index.table)!;
          const notes = [];
          if (smallTable(tableStats)) notes.push("table too small to judge");
          if (index.unique && !index.constraint_name)
            notes.push("standalone unique index; preserves uniqueness");
          if (
            (index.primary || index.unique || index.constraint_name) &&
            !index.idx_scan &&
            !index.fk_target
          )
            notes.push("enforces uniqueness only");
          if (index.fk_target) notes.push(`FKs: ${index.foreign_keys.join(", ")}`);
          return [
            index.table,
            index.name,
            kind(index),
            index.method,
            index.predicate ? "yes" : "no",
            bytes(index.size_bytes),
            number(tableStats.exact_rows),
            number(index.idx_scan),
            number(index.idx_tup_read),
            ratio(index.idx_scan * 1000, totalCalls),
            plans ? (planUse.get(index.name) ?? 0) : "—",
            index.fk_target ? "yes" : "no",
            verdict(index),
            notes.join("; "),
          ];
        }),
    ),
);

sections.push(
  "## REDUNDANCY\n\nPotential overlap only; not proof that either index can be removed. Predicate compatibility is conservative (equal predicates or a non-partial covering index).\n\n" +
    table(
      ["Table", "Index", "Other / covering index", "Overlap"],
      findRedundancy(snapshot.indexes).map((pair) => [
        pair.table,
        pair.index,
        pair.covering,
        pair.reason,
      ]),
    ),
);

sections.push(
  "## TABLE\n\n" +
    table(
      ["Table", "Rows", "Seq scans", "Seq tuples read", "Tuples/scan", "Signal"],
      [...snapshot.tables]
        .sort((a, b) => b.seq_tup_read - a.seq_tup_read)
        .map((tableStats) => [
          tableStats.table,
          number(tableStats.exact_rows),
          number(tableStats.seq_scan),
          number(tableStats.seq_tup_read),
          ratio(tableStats.seq_tup_read, tableStats.seq_scan),
          tableStats.seq_scan >= MANY_SEQ_SCANS && tableStats.exact_rows > SMALL_TABLE_ROWS
            ? "likely missing index; inspect queries"
            : "",
        ]),
    ),
);

sections.push(
  "## WRITE COST\n\n" +
    table(
      [
        "Table",
        "Inserts",
        "Updates",
        "Deletes",
        "HOT %",
        "Indexes",
        "Index size",
        "Table size",
        "Index/table",
      ],
      snapshot.tables.map((tableStats) => [
        tableStats.table,
        number(tableStats.n_tup_ins),
        number(tableStats.n_tup_upd),
        number(tableStats.n_tup_del),
        ratio(tableStats.n_tup_hot_upd * 100, tableStats.n_tup_upd),
        snapshot.indexes.filter((index) => index.table === tableStats.table).length,
        bytes(tableStats.index_size_bytes),
        bytes(tableStats.table_size_bytes),
        ratio(tableStats.index_size_bytes, tableStats.table_size_bytes),
      ]),
    ),
);

function topStatements(metric: "total_exec_time" | "calls") {
  return table(
    ["Query ID", "Calls", "Total ms", "Mean ms", "Rows", "Indexes in generic plan", "Query"],
    [...snapshot.statements]
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 25)
      .map((statement: StatementStats) => {
        const plan = statementPlans.get(statement.key);
        return [
          statement.queryid,
          number(statement.calls),
          number(statement.total_exec_time, 2),
          number(statement.mean_exec_time, 2),
          number(statement.rows),
          plan?.error ? `ERROR: ${plan.error}` : plan?.plan?.indexes.join(", ") || "—",
          statement.query.replace(/\s+/g, " ").slice(0, QUERY_TEXT_LIMIT),
        ];
      }),
  );
}
sections.push(
  "## TOP STATEMENTS\n\n### By total execution time\n\n" +
    topStatements("total_exec_time") +
    "\n\n### By calls\n\n" +
    topStatements("calls"),
);

if (plans) {
  sections.push(
    "## WHAT-IF\n\nEach index was dropped alone and rolled back. Costs are planner units, not milliseconds. All non-unique, unconstrained secondary indexes are checked; verdicts below use the snapshot counters.\n\n" +
      table(
        [
          "Table",
          "Index",
          "Verdict",
          "Statement key",
          "Cost before",
          "Cost after",
          "Replacement access path / error",
        ],
        plans.what_if.flatMap((result) => {
          const index = snapshot.indexes.find((index) => index.name === result.index);
          const label = index ? verdict(index) : "not in snapshot";
          if (!result.statements.length)
            return [
              [
                result.table,
                result.index,
                label,
                "—",
                "—",
                "—",
                result.error ?? "no baseline generic plan used this index",
              ],
            ];
          return result.statements.map((statement) => [
            result.table,
            result.index,
            label,
            statement.key,
            statement.cost_before,
            statement.plan_after?.total_cost ?? "—",
            result.error ??
              statement.error ??
              statement.plan_after?.access_paths
                .map(
                  (path) =>
                    `${path.node} ${path.table ?? ""}${path.index ? ` via ${path.index}` : ""}`,
                )
                .join("; "),
          ]);
        }),
      ),
  );
  const failures = plans.statements.filter((statement) => statement.error);
  if (failures.length)
    sections.push(
      "### EXPLAIN failures\n\n" +
        table(
          ["Statement key", "Error"],
          failures.map((statement) => [statement.key, statement.error]),
        ),
    );
}

await Bun.write(`${dataDirectory}/report-${label}.md`, `${sections.join("\n\n")}\n`);
const verdictCounts = new Map<string, number>();
for (const index of snapshot.indexes)
  verdictCounts.set(verdict(index), (verdictCounts.get(verdict(index)) ?? 0) + 1);
console.log(
  `Saved report-${label}.md: ${snapshot.tables.length} tables, ${snapshot.indexes.length} indexes, ${number(totalCalls)} calls.`,
);
console.table([...verdictCounts].map(([verdict, indexes]) => ({ verdict, indexes })));

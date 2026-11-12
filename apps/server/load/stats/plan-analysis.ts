export interface AccessPath {
  node: string;
  schema?: string;
  table?: string;
  index?: string;
}

export interface PlanSummary {
  total_cost: number;
  indexes: string[];
  seq_scan_tables: string[];
  access_paths: AccessPath[];
}

export interface StatementPlan {
  key: string;
  queryid: string;
  query: string;
  plan?: PlanSummary;
  error?: string;
}

export interface WhatIf {
  table: string;
  index: string;
  statements: {
    key: string;
    cost_before: number;
    plan_after?: PlanSummary;
    error?: string;
  }[];
  error?: string;
}

export interface Plans {
  captured_at: string;
  database: string;
  stats_reset: string | null;
  statements_reset: string | null;
  statements: StatementPlan[];
  what_if: WhatIf[];
}

export function summarizePlan(value: unknown): PlanSummary {
  const documents = value as { Plan: Record<string, unknown> }[];
  const cost = documents[0]?.Plan?.["Total Cost"];
  if (typeof cost !== "number") throw new Error("EXPLAIN returned no root plan cost.");
  const indexes = new Set<string>();
  const tables = new Set<string>();
  const paths: AccessPath[] = [];
  function walk(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const child of value) walk(child);
      return;
    }
    const node = value as Record<string, unknown>;
    const type = node["Node Type"];
    const index = node["Index Name"];
    const table = node["Relation Name"];
    if (typeof type === "string" && (type.includes("Scan") || type === "ModifyTable")) {
      paths.push({
        node: type,
        schema: typeof node.Schema === "string" ? node.Schema : undefined,
        table: typeof table === "string" ? table : undefined,
        index: typeof index === "string" ? index : undefined,
      });
    }
    if (
      ["Index Scan", "Index Only Scan", "Bitmap Index Scan"].includes(String(type)) &&
      typeof index === "string"
    ) {
      indexes.add(index);
    }
    if ((type === "Seq Scan" || type === "Parallel Seq Scan") && typeof table === "string") {
      tables.add(table);
    }
    for (const child of Object.values(node)) walk(child);
  }
  walk(value);
  return {
    total_cost: cost,
    indexes: [...indexes].sort(),
    seq_scan_tables: [...tables].sort(),
    access_paths: paths,
  };
}

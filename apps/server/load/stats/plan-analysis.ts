import { z } from "zod";

const planNodeSchema = z.object({
  "Node Type": z.string(),
  "Total Cost": z.number().optional(),
  "Index Name": z.string().optional(),
  "Relation Name": z.string().optional(),
  Schema: z.string().optional(),
  get Plans() {
    return z.array(planNodeSchema).optional();
  },
});

export const explainPlanSchema = z
  .array(
    z.object({
      Plan: planNodeSchema.extend({ "Total Cost": z.number() }),
    }),
  )
  .min(1);

type ExplainPlan = z.infer<typeof explainPlanSchema>;
type PlanNode = z.infer<typeof planNodeSchema>;

interface AccessPath {
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

export function summarizePlan(documents: ExplainPlan): PlanSummary {
  const root = documents[0]!.Plan;
  const indexes = new Set<string>();
  const tables = new Set<string>();
  const paths: AccessPath[] = [];
  function walk(node: PlanNode) {
    const type = node["Node Type"];
    const index = node["Index Name"];
    const table = node["Relation Name"];
    if (type.includes("Scan") || type === "ModifyTable") {
      paths.push({
        node: type,
        schema: node.Schema,
        table,
        index,
      });
    }
    if (
      ["Index Scan", "Index Only Scan", "Bitmap Index Scan"].includes(type) &&
      index !== undefined
    ) {
      indexes.add(index);
    }
    if ((type === "Seq Scan" || type === "Parallel Seq Scan") && table !== undefined) {
      tables.add(table);
    }
    for (const child of node.Plans ?? []) walk(child);
  }
  for (const document of documents) walk(document.Plan);
  return {
    total_cost: root["Total Cost"],
    indexes: [...indexes].sort(),
    seq_scan_tables: [...tables].sort(),
    access_paths: paths,
  };
}

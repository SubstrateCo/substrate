import { explainPlanSchema, summarizePlan } from "./plan-analysis";
import { expect, test } from "bun:test";

test("summarizes nested scan paths with sorted, distinct index and table names", () => {
  const plan = explainPlanSchema.parse([
    {
      Plan: {
        "Node Type": "Nested Loop",
        "Total Cost": 120.5,
        Plans: [
          {
            "Node Type": "Index Scan",
            "Index Name": "tasks_project_idx",
            "Relation Name": "tasks",
            Schema: "public",
          },
          {
            "Node Type": "Bitmap Heap Scan",
            "Relation Name": "messages",
            Plans: [
              { "Node Type": "Bitmap Index Scan", "Index Name": "messages_conversation_idx" },
              { "Node Type": "Bitmap Index Scan", "Index Name": "messages_conversation_idx" },
            ],
          },
          { "Node Type": "Seq Scan", "Relation Name": "tasks" },
          { "Node Type": "Parallel Seq Scan", "Relation Name": "actors" },
          { "Node Type": "Seq Scan", "Relation Name": "actors" },
        ],
      },
    },
  ]);

  const summary = summarizePlan(plan);
  expect(summary.total_cost).toBe(120.5);
  expect(summary.indexes).toEqual(["messages_conversation_idx", "tasks_project_idx"]);
  expect(summary.seq_scan_tables).toEqual(["actors", "tasks"]);
  expect(summary.access_paths).toEqual([
    { node: "Index Scan", schema: "public", table: "tasks", index: "tasks_project_idx" },
    { node: "Bitmap Heap Scan", table: "messages" },
    { node: "Bitmap Index Scan", index: "messages_conversation_idx" },
    { node: "Bitmap Index Scan", index: "messages_conversation_idx" },
    { node: "Seq Scan", table: "tasks" },
    { node: "Parallel Seq Scan", table: "actors" },
    { node: "Seq Scan", table: "actors" },
  ]);
});

test("keeps modification targets without treating them as sequential scans", () => {
  const plan = explainPlanSchema.parse([
    {
      Plan: {
        "Node Type": "ModifyTable",
        "Relation Name": "tasks",
        Schema: "public",
        "Total Cost": 0,
      },
    },
  ]);

  expect(summarizePlan(plan)).toEqual({
    total_cost: 0,
    indexes: [],
    seq_scan_tables: [],
    access_paths: [{ node: "ModifyTable", schema: "public", table: "tasks" }],
  });
});

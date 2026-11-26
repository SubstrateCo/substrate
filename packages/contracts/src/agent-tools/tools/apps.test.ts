import { leaseTools, toolApps } from "./registry.ts";
import { expect, test } from "bun:test";

for (const kind of ["main", "helper"] as const) {
  test(`${kind} leases omit disabled optional apps`, () => {
    const tools = leaseTools(kind);
    expect(tools).toContain("read_thread");
    expect(tools).toContain("search_content");
    expect(tools).not.toContain("get_task");
    expect(tools).not.toContain("get_crm_record");
    const crmOnly = leaseTools(kind, ["crm"]);
    expect(crmOnly).toContain("get_crm_record");
    expect(crmOnly).not.toContain("create_crm_follow_up");
    expect(leaseTools(kind, ["crm", "tasks"])).toContain("create_crm_follow_up");
  });
}

test("cross-app tools declare every required app", () => {
  expect(toolApps("create_crm_follow_up")).toEqual(["crm", "tasks"]);
  expect(toolApps("search_content")).toEqual([]);
});

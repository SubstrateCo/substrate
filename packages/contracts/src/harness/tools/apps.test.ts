import { enabledStartupSkills } from "../skills/registry.ts";
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

test("Meetings skill workflows discover only main-session tools of the enabled app", () => {
  const skill = enabledStartupSkills(["meetings"]).find((s) => s.id === "substrate-meetings")!;
  expect(enabledStartupSkills(["tasks", "crm"])).not.toContain(skill);
  const workflow = [
    ...new Set(Array.from(skill.content.matchAll(/`([a-z]+_[a-z_]+)`/g), (m) => m[1])),
  ];
  const tools = ["create_meeting", "get_meeting", "list_meetings", "read_meeting_source"] as const;
  expect(workflow.sort()).toEqual([...tools]);
  for (const tool of tools) {
    expect(leaseTools("main", ["meetings"])).toContain(tool);
    expect(leaseTools("main")).not.toContain(tool);
    expect(leaseTools("helper", ["meetings"])).not.toContain(tool);
  }
});

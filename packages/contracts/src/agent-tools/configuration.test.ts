import type { AppId } from "../apps/index.ts";
import { harnessConfiguration, type RuntimeAgentDefinition } from "./configuration.ts";
import { startupSkills } from "./skills/index.ts";
import { expect, test } from "bun:test";

const definition: RuntimeAgentDefinition = {
  id: "agent-a",
  name: "Agent",
  instructions: "Work locally",
  harness: "codex",
  enabled: true,
  disabledApps: [],
  substrateGuide: true,
};

function runtimeAgent(
  overrides: Partial<RuntimeAgentDefinition> = {},
  enabledApps: AppId[] = ["tasks"],
) {
  return harnessConfiguration({
    organizationId: "org-a",
    agents: [{ ...definition, ...overrides }],
    enabledApps,
  }).agents[0]!;
}

test("the guide prepends Substrate's instructions, and enabled apps install their skills", () => {
  const agent = runtimeAgent();
  expect(agent.instructions.startsWith("# Substrate workspace")).toBe(true);
  expect(agent.instructions).toContain("Organization ID: org-a");
  expect(agent.instructions.endsWith("## Agent instructions\n\nWork locally")).toBe(true);
  const installed = agent.managedSkills.filter((skill) => skill.installed).map((skill) => skill.id);
  expect(installed).toContain("substrate-tasks");
  expect(installed).not.toContain("substrate-inbox");
  // Every managed skill is listed, so the runtime removes the ones it no longer installs.
  expect(agent.managedSkills.map((skill) => skill.id)).toEqual(
    startupSkills.map((skill) => skill.id),
  );
});

test("helper folders get no publishing, helper management or local tools", () => {
  const { tools } = runtimeAgent();
  expect(tools?.main).toContain("reply");
  expect(tools?.main).toContain("save_handoff");
  expect(tools?.main).not.toContain("finish_helper");
  for (const name of ["reply", "start_helper", "save_handoff"])
    expect(tools?.helper).not.toContain(name);
  expect(tools?.helper).toContain("finish_helper");
  expect(tools?.helper).toContain("list_projects");
});

test("without the guide the agent runs on its own instructions and keeps its tools", () => {
  const agent = runtimeAgent({ substrateGuide: false });
  expect(agent.instructions).toBe("Work locally");
  expect(agent.tools?.main).toContain("reply");
  expect(agent.tools?.main).toContain("create_task");
});

test("a disabled app removes its skill and tools, and the core tools stay", () => {
  const agent = runtimeAgent({ disabledApps: ["tasks"] }, ["tasks", "crm"]);
  const installed = agent.managedSkills.filter((skill) => skill.installed).map((skill) => skill.id);
  expect(installed).not.toContain("substrate-tasks");
  expect(installed).toContain("substrate-crm");
  expect(agent.tools?.main).not.toContain("create_task");
  expect(agent.tools?.main).toContain("create_crm_account");
  for (const core of ["reply", "save_handoff", "get_me", "search_names"])
    expect(agent.tools?.main).toContain(core);
});

test("disabling an app the organization has not enabled changes nothing", () => {
  const disabled = runtimeAgent({ disabledApps: ["crm"] }, ["tasks"]);
  expect(disabled).toEqual(runtimeAgent({}, ["tasks"]));
});

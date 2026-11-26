import { harnessConfiguration } from "./configuration.ts";
import { startupSkills } from "./skills/index.ts";
import { expect, test } from "bun:test";

const definition = {
  id: "agent-a",
  name: "Agent",
  instructions: "Work locally",
  harness: "codex" as const,
  enabled: true,
  useStartupDefaults: true,
};

function runtimeAgent(
  overrides: Partial<typeof definition> = {},
  enabledApps = ["tasks" as const],
) {
  return harnessConfiguration({
    organizationId: "org-a",
    agents: [{ ...definition, ...overrides }],
    enabledApps,
  }).agents[0]!;
}

test("startup defaults prepend Substrate's instructions and install the skills of enabled apps", () => {
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

test("without startup defaults the agent runs on its own instructions, with no host tools", () => {
  const agent = runtimeAgent({ useStartupDefaults: false });
  expect(agent.instructions).toBe("Work locally");
  expect(agent.tools).toBeNull();
  expect(agent.managedSkills.every((skill) => !skill.installed)).toBe(true);
});

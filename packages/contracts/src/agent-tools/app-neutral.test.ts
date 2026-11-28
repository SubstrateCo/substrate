import { optionalAppIds, type AppId } from "../apps/index.ts";
import { startupInstructions } from "./defaults.ts";
import { runtimePolicy } from "./policy.ts";
import { agentToolProvider } from "./provider.ts";
import { appGuides, enabledStartupSkills, startupSkills } from "./skills/index.ts";
import { mcpTools, toolApps, type McpToolName } from "./tools/index.ts";
import { expect, test } from "bun:test";

// SAFETY: Object.keys reads the statically defined tool registry.
const toolNames = Object.keys(mcpTools) as McpToolName[];
const toolsOf = (app: AppId) => toolNames.filter((name) => toolApps(name).includes(app));
const appTools = toolNames.filter((name) => toolApps(name).length > 0);
const agent = { id: "agent-a", name: "Agent", harness: "claude" as const, organizationId: "org-a" };

function named(text: string) {
  return [
    ...appTools.filter((name) => new RegExp(`\\b${name}\\b`).test(text)),
    ...appGuides.flatMap((guide) => (text.includes(guide.skill.id) ? [guide.skill.id] : [])),
  ];
}

test("what every agent reads names no optional app, so apps can be added without rewriting it", () => {
  const general = {
    policy: runtimePolicy,
    server: agentToolProvider().server.instructions,
    instructions: startupInstructions(agent),
    ...Object.fromEntries(
      enabledStartupSkills([]).map((skill) => [skill.id, skill.description + skill.content]),
    ),
    ...Object.fromEntries(
      toolNames
        .filter((name) => toolApps(name).length === 0)
        .map((name) => [`tool ${name}`, mcpTools[name].description]),
    ),
  };
  const naming = Object.entries(general).flatMap(([source, text]) =>
    named(text).map((name) => `${source} names ${name}`),
  );
  expect(naming).toEqual([]);
  for (const guide of appGuides) expect(general.instructions).not.toContain(guide.purpose);
});

test("the instructions describe exactly the enabled apps", () => {
  for (const guide of appGuides) {
    const text = startupInstructions(agent, [guide.app]);
    expect(text).toContain(`- ${guide.title}: ${guide.purpose}`);
    for (const input of guide.inputs) expect(text).toContain(`- ${input}`);
    for (const other of appGuides.filter((entry) => entry !== guide)) {
      expect(text).not.toContain(other.purpose);
      const foreign = toolsOf(other.app).filter((name) => !toolApps(name).includes(guide.app));
      expect(named(text).filter((name) => foreign.some((tool) => tool === name))).toEqual([]);
    }
  }
});

test("every optional app with tools has a guide and a skill of its own", () => {
  const withTools = optionalAppIds.filter((app) => toolsOf(app).length > 0);
  expect(appGuides.map((guide) => guide.app).sort()).toEqual([...withTools].sort());
  expect(new Set(appGuides.map((guide) => guide.skill.id)).size).toBe(appGuides.length);
  for (const guide of appGuides) {
    expect(startupSkills).toContain(guide.skill);
    for (const input of guide.inputs) {
      const tool = toolNames.find((name) => name === input.split(" ").at(0));
      expect(tool).toBeDefined();
      expect(toolApps(tool!).every((app) => app === guide.app)).toBe(true);
    }
  }
});

test("an app skill names tools of its own app and of the core, not of another app", () => {
  for (const guide of appGuides) {
    const text = guide.skill.description + guide.skill.content;
    const foreign = named(text).filter(
      (name) => !toolsOf(guide.app).some((tool) => tool === name) && name !== guide.skill.id,
    );
    expect({ skill: guide.skill.id, foreign }).toEqual({ skill: guide.skill.id, foreign: [] });
  }
});

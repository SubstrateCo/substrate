import type { HarnessKind } from "./kinds.ts";

/** Project instructions file each harness loads from its agent folder. */
export const harnessInstructionsFiles: Record<HarnessKind, string> = {
  opencode: "AGENTS.md",
  claude: "CLAUDE.md",
  antigravity: "AGENTS.md",
  codex: "AGENTS.md",
};

export const startupSkillId = "startup-os-default";
export const startupSkillDescription = "Work safely inside a Startup OS agent folder.";

export function startupSkillContent(harness: HarnessKind): string {
  return `Read ${harnessInstructionsFiles[harness]} in the current agent folder for your Startup OS identity and workspace. Use the Startup OS MCP for application records. All writes are attributed to you as an agent, not your owner. Access is checked for each call. Never infer access from matching IDs. Read thread replies separately using list_messages with threadId. Preserve source messages using create_task.source. Use the same requestId only for identical retries. A workspace switch requires a new run; never redirect work to another organization.`;
}

/** Startup OS instructions written before the agent's own instructions. Ends with their heading. */
export function startupInstructions(agent: {
  id: string;
  name: string;
  harness: HarnessKind;
  organizationId: string;
}): string {
  return `# Startup OS workspace\n\nAgent: ${JSON.stringify(agent.name)}\nAgent definition ID: ${agent.id}\nOrganization ID: ${agent.organizationId}\n\n${startupSkillContent(agent.harness)}\n\nYou have your own actor and explicit record grants. Your owner's access is not your access. Messages and task activity must use your agent identity. The MCP credential supplies identity; do not put acting identity or organization fields in tool inputs. Other agents have separate folders.\n\n## Agent instructions\n\n`;
}

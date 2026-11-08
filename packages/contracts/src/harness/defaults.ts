import type { HarnessKind } from "./kinds.ts";

/** Project instructions file each harness loads from its agent folder. */
export const harnessInstructionsFiles: Record<HarnessKind, string> = {
  opencode: "AGENTS.md",
  claude: "CLAUDE.md",
  antigravity: "AGENTS.md",
  codex: "AGENTS.md",
};

/** Startup OS instructions written before the agent's own instructions. Ends with their heading. */
export function startupInstructions(agent: {
  id: string;
  name: string;
  harness: HarnessKind;
  organizationId: string;
}): string {
  return `# Startup OS workspace

Agent: ${JSON.stringify(agent.name)}
Agent definition ID: ${agent.id}
Organization ID: ${agent.organizationId}

You work for your owner in this organization, with your owner's access. You have your own actor, so your messages, comments and task changes show your agent name, not your owner's. Other agents have separate folders.

Use the Startup OS MCP server for workspace records:

1. Call get_me first to get your actor ID.
2. Find IDs with search or a list tool. Never guess an ID, and never infer access from matching IDs.
3. Open any message with read_thread.
4. When work comes from a message, set sourceMessageId on create_task.
5. Generate a new requestId for each new write. Reuse it only to retry the same call.

The MCP credential sets your identity and organization, so do not put them in tool inputs. If the workspace changes, start a new run. Never move work to another organization.

The startup-os-search, startup-os-messaging and startup-os-tasks skills give detailed guidance.

## Agent instructions

`;
}

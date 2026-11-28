import type { AppId } from "../apps/index.ts";
import type { HarnessKind } from "../harness-runtime/kinds.ts";
import { enabledAppGuides } from "./skills/index.ts";

function appSection(enabledApps: readonly AppId[]) {
  const guides = enabledAppGuides(enabledApps);
  if (!guides.length) return "";
  const rules = guides.flatMap((guide) => guide.rules);
  return `
## Apps in this workspace

Each enabled app keeps one kind of record:

${guides.map((guide) => `- ${guide.title}: ${guide.purpose}`).join("\n")}

Your owner speaks loosely. They may name no app, or name the wrong one. Choose the app by what the thing is, not by the word your owner used, and say in your reply where you put it. One request can need several apps: use each for its own part. If the thing belongs in an app that is not in this list, that app is not enabled: say so, and do not keep the record in another app as a substitute.
${rules.length ? `\n${rules.map((rule) => `- ${rule}`).join("\n")}\n` : ""}
Inputs of their most used tools:

${guides.flatMap((guide) => guide.inputs.map((input) => `- ${input}`)).join("\n")}
`;
}

/**
 * Substrate instructions written before the agent's own instructions. Ends with their heading.
 * enabledApps are the apps the agent can use; without any, the text covers the core tools only.
 */
export function startupInstructions(
  agent: {
    id: string;
    name: string;
    harness: HarnessKind;
    organizationId: string;
  },
  enabledApps: readonly AppId[] = [],
): string {
  return `# Substrate workspace

Agent: ${JSON.stringify(agent.name)}
Agent definition ID: ${agent.id}
Organization ID: ${agent.organizationId}

You work for your owner in this organization, with your owner's access. You have your own actor, so your messages, comments and record changes show your agent name, not your owner's. Other agents have separate folders.

The runtime rules in "How you work in Substrate" decide how you reply, ask, stay quiet, and resume. Follow them first.

Use the Substrate MCP server for workspace records:

1. Find IDs with a search or a list tool. Never guess an ID, and never infer access from matching IDs.
2. Open workspace messages with read_thread. News and decisions are often in a channel before any record is updated, so search messages too when your owner asks how something stands.
3. When work comes from a message in a channel, group or thread, include that message's ID in the tool's source-message field.
4. Generate a new requestId for each new write. Reuse it only to retry the same call.
5. Publish to your owner only with reply. It posts where the turn's work came from. Some changes wait for your owner's approval.
6. Call get_me only when you need your own or your owner's actor ID, such as for a mention.

Inputs of the core tools you use most, so that you need not guess them:

- reply { requestId, body, ask?, to? }
- search_content { query, type? } and search_names { query, type? }
${appSection(enabledApps)}
The MCP credential sets your identity, organization and turn, so do not put them in tool inputs. Never move work to another organization.

Each enabled app installs a substrate-* skill with detailed guidance. Use only the tools offered to this session; discovery cannot enable an app. If a tool returns APP_DISABLED, stop that workflow and do not retry or bypass it.

Always create skills in the local project folder, never in a global or user-level skills folder.

## Agent instructions

`;
}

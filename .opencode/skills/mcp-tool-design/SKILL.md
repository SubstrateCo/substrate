---
name: mcp-tool-design
description: >
  Design and change the tools, tool descriptions, skills and prompt text that
  agents use through the Substrate MCP server. Use before you add or change a
  tool in packages/contracts/src/agent-tools/tools, its handler in
  packages/database/src/features/mcp, an agent skill, an app guide, the agent
  instructions or the runtime policy: "add an MCP tool", "agents cannot do X",
  "agent uses too many calls", "agent asks too many questions", "tool error",
  "add an app for agents", "improve the tool description".
---

## Who calls these tools

A language model calls them for an owner who speaks loosely: no IDs, no app names, half the facts. Different models call them through different harnesses. Each rule below comes from a failure that the agent evals measured. Design for the weakest caller, then measure.

## Where things are

| Thing | Place |
| --- | --- |
| Tool name, description, input and output | `packages/contracts/src/agent-tools/tools/<domain>.ts` |
| Tool registry and app gating | `packages/contracts/src/agent-tools/tools/registry.ts` |
| Handler | `packages/database/src/features/mcp/<domain>.ts`, wired in `handlers.ts` |
| Replay access check for a tool with `requestId` | `packages/database/src/features/mcp/tool-execution.ts` |
| App guide and skill | `packages/contracts/src/agent-tools/skills/<app>.ts`, listed in `skills/registry.ts` |
| Instructions for every agent | `packages/contracts/src/agent-tools/defaults.ts` |
| Runtime policy | `packages/contracts/src/agent-tools/policy.ts` |
| Turn input | `packages/agent-host/src/turns/envelope.ts` |
| Evals | `tooling/agent-evals` |

## Rules

### 1. One flat input object

Some harnesses show no fields for a tool whose input is a union. The agent then reports that the tool "exposes no input fields".

- Bad: `input: z.discriminatedUnion("action", [...])`.
- Good: one strict object with an `action` enum and optional fields. The handler checks the fields of each action with the form's own schema and names the field to correct.

`tools.test.ts` fails for a top-level union.

### 2. An update changes only the supplied fields

A replace-all update loses data. An agent sent `contactEntityIds: []` to change a deal's amount, and the deal lost its contact.

- Bad: "Replace deal fields. Read first and preserve unchanged values."
- Good: every field optional; the handler reads the record and merges. Say when a list field replaces the whole list.

### 3. One owner intent, one call

Count the calls for the most common request. Each extra call costs time and is a chance to fail.

- A filter instead of a loop: `list_tasks` without `projectId` reads all projects; `list_crm_records` without `kind` searches all kinds.
- Create with its parts: `create_crm_contact` takes email, phone, account and title.
- A default instead of a lookup: `transition_crm_deal` keeps the stage when `stageId` is left out; `move_task` defaults to top level.
- An alias instead of an ID: an assignee is `"owner"`, `"me"` or an actor ID.

### 4. A result carries what the next step needs

If agents call a second tool after yours in most runs, put that field in your result.

- A deal shows `stageName`, not only `stageId`.
- A task search hit shows status, priority, due date and project.
- A project hit shows `archived`. Without it, an agent asked the owner to choose between a live and an archived project.
- `list_assignees` lists everyone, with `assignable`. When it listed only current members, agents could not find the person to share a project with.

### 5. An error says what is wrong and what to do

A bare "Not found" or "Invalid reference" makes the agent search for other IDs or give up.

- Bad: `Invalid reference.`
- Good: `Invalid reference @[deal:…]. A message can mention only a task, project, person, agent, channel or thread… Write anything else as plain text.`

Throw `ValidationError` with the fix for input the agent can correct. Keep `AccessDeniedError` for records, so that existence does not leak.

### 6. A description says when to use the tool, and never invites misuse

The agent often reads only the description and the schema.

- State the purpose, the defaults, and the one thing that goes wrong.
- Bad: "Mention records only with @[kind:uuid] tokens." Agents then wrote `@[deal:…]`, which does not exist.
- Good: "You can mention a task, project or person as @[task:id]… Write CRM accounts, contacts and deals by name."
- If two tools overlap, say which one to use. Agents ran `search_names` and `search_content` for the same words until one description said that it covers titles too.
- A core tool must not name a tool of an optional app. Write "the read tool of its app".

### 7. Do not ask for approval that the owner gave

The owner's request in the turn is the approval for what it names. Text that demanded "explicit approval of the exact fields" made three of four models answer "add this lead" with a confirmation form. Keep a consent step only for what the owner did not ask for. Deletions wait for approval in the server, not in the prompt.

A question costs the owner a full turn. For a small, reversible choice, tell the agent to choose the closest fit and say what it chose.

### 8. Refuse input that looks right but is lossy

A phone number without a country was stored and could not be matched again. The tool now refuses it and says how to add the country. Do this in the MCP handler when people may still enter the loose form.

### 9. Keep apps out of the general text

Apps will be added. The policy, the server instructions, the core instructions, the core skills and the core tool descriptions name no optional app. Everything about an app is in its `AppGuide`:

- `purpose`: what belongs in the app, in the owner's words, with the loose phrases they use. Agents route a request that names no app, or the wrong app, from this.
- `rules` and `inputs`: shown only while the app is enabled.
- `skill`: the detailed workflow.

A new app adds one guide to `appGuides`. `app-neutral.test.ts` fails when general text names an app's tool, or when an app with tools has no guide.

### 10. Put a rule where the agent will read it

Agents do not always load a skill, and the Claude harness defers tool schemas until first use.

- A rule for one tool goes in that tool's description.
- Inputs of the most used tools go in the instructions (`inputs` of the app guide), or the model guesses `text` for `body` and the call is rejected.
- A rule that must always hold goes in code. A reminder did not stop a model from writing its answer as plain text; the host now asks once for the unsent answer (`nudgeUnsentAnswer`).

### 11. Give the agent the facts it cannot look up

The agent knows only the turn input. The envelope carries the owner's local time, weekday and time zone, because UTC alone gave wrong due dates and a question about the time zone.

## Checklist for a new or changed tool

1. Write the owner's request in spoken words. Count the calls a careful agent needs. Lower the count with rules 3 and 4.
2. Define the tool: flat strict input, `requestId` on writes, a description by rule 6.
3. Write the handler. Errors by rule 5. Add the replay check when the tool takes `requestId`.
4. Test behaviour in `packages/database/src/features/mcp/*.test.ts` with the fixtures there.
5. Add the tool's input to its app guide if agents use it often.
6. If you changed `runtimePolicy`, bump `POLICY_VERSION` and update the hash in `policy.test.ts`.
7. Add or extend an eval scenario, then run the evals.

## Measure with the evals

```sh
bun run evals --label my-change --compare <earlier-label>   # every scenario, every model
bun run evals --label probe --scenarios call-notes --models sonnet,terra
bun run evals:trace my-change <scenario> <model>             # what the agent did in a run
bun run evals:models                                        # model IDs that each harness offers
```

The evals need `bun run services:test`. One run at a time: a run drops the eval databases of other runs. Reports are in `.runtime/evals/<label>/summary.md`.

Read the report in this order:

1. **Failures**: read the trace before you change anything. Many first failures are a fault of the scenario or its check.
2. **Failed tool calls** and **Rejected input**: each line is a description or an error to fix.
3. **Questions**: a question the owner already answered is a prompt fault.
4. **Tool calls against the budget**: read the trace of the scenario with the lowest efficiency and remove the call that every model repeats.

Write scenario messages as speech: rambling, corrected halfway, with no IDs, and sometimes with the wrong app name. Check the workspace state afterwards, not the wording of the reply. When most runs pass, add harder scenarios instead of tuning text for the ones you have.

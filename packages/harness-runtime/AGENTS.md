# Harness runtime

- The runtime runs native agent sessions and serves the host's tools. It knows no Substrate product concepts: no tool names, apps, skills, instruction text, error codes or turn context. Import only `@substrate/contracts/harness-runtime` (the runtime protocol, which imports no other Substrate contracts) and generic utilities.
- The host supplies its tools as a `ToolProvider` in `HarnessHostOptions`: the MCP server identity, tool descriptions, calls, output policies, error hints and paging fields. `configure` supplies each agent's instructions text, managed skills and per-folder tool names. Substrate's provider and configuration live in `@substrate/contracts/agent-tools`.
- ACP request normalization lives in `src/acp/requests.ts` (`@substrate/harness-runtime/requests`). It maps native requests to the protocol's approval and question payloads.
- Each agent uses `<accountDirectory>/orgs/<organizationId>/<agentId>` as its working directory, with its own local skills and MCP settings. Do not initialize Git automatically.
- Helpers use sibling folders at `orgs/<organizationId>/_helpers/<agentId>/<helperId>`. Never nest a helper inside its agent's folder: native harnesses read instruction files from parent folders, and the parent's sandbox would cover the helper's files.
- Set adapter capability flags only from evidence in the installed SDK or protocol types, and cite it in a `file:line` comment beside the flags. Leave anything unproven false.
- Adapters emit only canonical `HarnessEvent`s. Keep raw native payloads inside the adapter. Native output outside one of our turns carries a null `turnId`.
- Deliver the managed policy prefix through each adapter's own channel, and keep it byte-stable within an epoch.
- Unattended turns run with the no-ask profile: every native permission or question is denied.
- A turn command's context is opaque to the runtime. The tool provider validates it with `bind` for the turn; the runtime binds the result to the session's MCP endpoint for the duration of one turn and passes it back unchanged on each call. Reject MCP calls outside a live turn.
- An interrupt must always end in a terminal event or `session.closed`. When the worker exits, main emits `session.closed` for every open session.

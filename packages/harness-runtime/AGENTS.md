# Harness runtime

- Each agent uses `<accountDirectory>/orgs/<organizationId>/<agentId>` as its working directory, with its own local skills and MCP settings. Do not initialize Git automatically.
- Helpers use sibling folders at `orgs/<organizationId>/_helpers/<agentId>/<helperId>`. Never nest a helper inside its agent's folder: native harnesses read instruction files from parent folders, and the parent's sandbox would cover the helper's files.
- Set adapter capability flags only from evidence in the installed SDK or protocol types, and cite it in a `file:line` comment beside the flags. Leave anything unproven false.
- Adapters emit only canonical `HarnessEvent`s. Keep raw native payloads inside the adapter. Native output outside one of our turns carries a null `turnId`.
- Deliver the managed policy prefix through each adapter's own channel, and keep it byte-stable within an epoch.
- Unattended turns run with the no-ask profile: every native permission or question is denied.
- Bind the `TurnContext` to the session's MCP endpoint for the duration of one turn. Reject MCP calls outside a live turn.
- An interrupt must always end in a terminal event or `session.closed`. When the worker exits, main emits `session.closed` for every open session.

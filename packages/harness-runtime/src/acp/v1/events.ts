import type { AcpConfigOption, AcpConfigSelectValue } from "../api.ts";
import type { AcpUpdate } from "../driver.ts";
import type { SessionConfigOption, SessionUpdate } from "@agentclientprotocol/sdk/unstable";

/** Flattens grouped select values. */
export function configOptionsV1(options: SessionConfigOption[] | null | undefined) {
  return (options ?? []).map((option): AcpConfigOption => {
    const values: AcpConfigSelectValue[] =
      option.type === "boolean"
        ? []
        : option.options
            .flatMap((entry) => ("group" in entry ? entry.options : [entry]))
            .map((entry) => {
              const value: AcpConfigSelectValue = { value: entry.value, name: entry.name };
              if (entry.description) value.description = entry.description;
              return value;
            });
    const flattened: AcpConfigOption = {
      id: option.id,
      name: option.name,
      type: option.type,
      currentValue: option.currentValue,
      values,
    };
    if (option.category) flattened.category = option.category;
    return flattened;
  });
}

/** Reduces one v1 session/update. Updates the client does not act on return undefined. */
export function updateV1(update: SessionUpdate): AcpUpdate | undefined {
  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      if (update.content.type !== "text") return undefined;
      const text: Extract<AcpUpdate, { type: "text" }> = {
        type: "text",
        text: update.content.text,
      };
      if (update.messageId) text.messageId = update.messageId;
      return text;
    }
    case "tool_call":
    case "tool_call_update": {
      const tool: Extract<AcpUpdate, { type: "tool" }> = {
        type: "tool",
        toolCallId: update.toolCallId,
        created: update.sessionUpdate === "tool_call",
      };
      if (update.title) tool.title = update.title;
      if (update.kind) tool.kind = update.kind;
      if (update.name) tool.name = update.name;
      if (update.rawInput !== undefined) tool.rawInput = update.rawInput;
      if (update.status) tool.status = update.status;
      return tool;
    }
    case "usage_update":
      return { type: "usage", used: update.used, size: update.size };
    case "compaction_update":
      return { type: "compaction", status: update.status };
    case "available_commands_update":
      return { type: "commands", names: update.availableCommands.map((command) => command.name) };
    case "config_option_update":
      return { type: "config", options: configOptionsV1(update.configOptions) };
    // Thoughts, plans, modes, notices and the rest are not part of a canonical turn.
    case "user_message_chunk":
    case "agent_thought_chunk":
    case "plan":
    case "plan_update":
    case "plan_removed":
    case "current_mode_update":
    case "session_info_update":
    case "notice":
    case "compaction_summary_chunk":
    case "prompt_suggestions_update":
    case "cursor_update":
    case "subagent_update":
    case "session_message":
    case "session_message_chunk":
      return undefined;
  }
}

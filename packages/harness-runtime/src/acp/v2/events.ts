import { HarnessError } from "../../errors.ts";
import type { AcpConfigOption, AcpConfigSelectValue } from "../api.ts";
import type { AcpPromptResult, AcpToolStatus, AcpUpdate } from "../driver.ts";
import {
  AvailableCommand,
  ContentBlock,
  IdleStateUpdate,
  SessionConfigOption,
  SessionUpdate,
  type IdleStateUpdate as IdleState,
  type ToolCallStatus,
} from "@agentclientprotocol/sdk/experimental/v2/unstable";

/**
 * Flattens grouped select values. Custom and future option types are skipped: the client
 * cannot set them (SessionConfigOption, dist/v2/unstable/schema/types.gen.d.ts:3054-3078).
 */
export function configOptionsV2(options: SessionConfigOption[] | null | undefined) {
  const flattened: AcpConfigOption[] = [];
  for (const option of options ?? []) {
    let entry: AcpConfigOption;
    if (SessionConfigOption.isBoolean(option))
      entry = {
        id: option.configId,
        name: option.name,
        type: "boolean",
        currentValue: option.currentValue,
        values: [],
      };
    else if (SessionConfigOption.isSelect(option))
      entry = {
        id: option.configId,
        name: option.name,
        type: "select",
        currentValue: option.currentValue,
        values: option.options
          .flatMap((value) => ("groupId" in value ? value.options : [value]))
          .map((value) => {
            const mapped: AcpConfigSelectValue = { value: value.value, name: value.name };
            if (value.description) mapped.description = value.description;
            return mapped;
          }),
      };
    else continue;
    if (option.category) entry.category = option.category;
    flattened.push(entry);
  }
  return flattened;
}

/** Slash commands only: skills and custom command types are not invoked as /name. */
export function commandNamesV2(commands: AvailableCommand[] | null | undefined) {
  return (commands ?? []).filter(AvailableCommand.isCommand).map((command) => command.name);
}

export function stopResultV2(idle: IdleState): AcpPromptResult | HarnessError {
  if (IdleStateUpdate.isError(idle))
    return new HarnessError("native-request", idle.error?.message ?? "The agent turn failed.");
  // An omitted or null stop reason still means idle (types.gen.d.ts:4009-4011).
  const result: AcpPromptResult = { stopReason: idle.stopReason ?? "unknown" };
  const usage = idle.usage;
  if (usage) {
    result.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
    if (usage.cachedReadTokens != null) result.usage.cachedInputTokens = usage.cachedReadTokens;
  }
  return result;
}

const blockText = (block: ContentBlock) => (ContentBlock.isText(block) ? block.text : "");

/** v2 adds cancelled and paused, and the enum is open (types.gen.d.ts:239). */
function toolStatus(status: ToolCallStatus | null | undefined): AcpToolStatus | undefined {
  switch (status) {
    case "pending":
    case "in_progress":
    case "completed":
    case "failed":
      return status;
    case "cancelled":
      return "failed";
    case "paused":
      return "in_progress";
    case null:
    case undefined:
    default:
      return undefined;
  }
}

/**
 * Reduces one session's v2 updates to append-only client updates. v2 updates are upserts by
 * ID: an omitted field is unchanged and null clears it. The client keeps no history, so a
 * replaced message emits only text that extends what it already got; other rewrites are
 * dropped. state_update is not reduced here: the driver owns turn state.
 */
export class SessionUpdatesV2 {
  private readonly messages = new Map<string, string>();
  private readonly tools = new Set<string>();

  reduce(update: SessionUpdate): AcpUpdate | undefined {
    if (SessionUpdate.isAgentMessageChunk(update)) {
      const text = blockText(update.content);
      this.messages.set(update.messageId, (this.messages.get(update.messageId) ?? "") + text);
      return text ? { type: "text", text, messageId: update.messageId } : undefined;
    }
    if (SessionUpdate.isAgentMessage(update)) {
      // Omitted content leaves the message unchanged; null or [] clears it.
      if (update.content === undefined) return undefined;
      const next = (update.content ?? []).map(blockText).join("");
      const shown = this.messages.get(update.messageId) ?? "";
      this.messages.set(update.messageId, next);
      if (!next.startsWith(shown) || next === shown) return undefined;
      return { type: "text", text: next.slice(shown.length), messageId: update.messageId };
    }
    if (SessionUpdate.isToolCallUpdate(update)) {
      const created = !this.tools.has(update.toolCallId);
      const tool: Extract<AcpUpdate, { type: "tool" }> = {
        type: "tool",
        toolCallId: update.toolCallId,
        created,
      };
      if (update.title) tool.title = update.title;
      if (update.kind) tool.kind = update.kind;
      if (update.name) tool.name = update.name;
      if (update.rawInput !== undefined && update.rawInput !== null)
        tool.rawInput = update.rawInput;
      const status = toolStatus(update.status);
      if (status) tool.status = status;
      if (status === "completed" || status === "failed") this.tools.delete(update.toolCallId);
      else this.tools.add(update.toolCallId);
      return tool;
    }
    if (SessionUpdate.isUsageUpdate(update))
      return { type: "usage", used: update.used, size: update.size };
    if (SessionUpdate.isCompactionUpdate(update))
      return { type: "compaction", status: update.status };
    if (SessionUpdate.isAvailableCommandsUpdate(update))
      return { type: "commands", names: commandNamesV2(update.availableCommands) };
    if (SessionUpdate.isConfigOptionUpdate(update))
      return { type: "config", options: configOptionsV2(update.configOptions) };
    return undefined;
  }

  endTurn() {
    this.messages.clear();
  }
}

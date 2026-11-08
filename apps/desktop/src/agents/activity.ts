import type { HarnessKind } from "@startup-os/contracts/harness";

/* oxlint-disable deslop/no-unknown-parameters, deslop/no-runtime-typeof -- Native activity payloads are untyped JSON from each harness. */
import { z } from "zod";

const jsonObject = z.record(z.string(), z.unknown());
const record = (value: unknown) => jsonObject.safeParse(value).data ?? {};
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const clip = (value: string) => (value.length > 200 ? `${value.slice(0, 199)}…` : value);

/**
 * One short line for the run card, or null for native noise. This is best effort: each harness
 * reports tool use differently, and unknown events are skipped rather than shown raw.
 */
export function activityLine(harness: HarnessKind, name: string, data: unknown): string | null {
  const value = record(data);
  let line: string | null = null;
  switch (harness) {
    case "claude": {
      if (name === "tool_progress")
        line = text(value.tool_name) && `Using ${text(value.tool_name)}`;
      else if (name === "system" && value.subtype === "compact_boundary")
        line = "Compacting context";
      break;
    }
    case "codex": {
      if (name !== "item/started") break;
      const item = record(value.item);
      if (item.type === "commandExecution") line = `Running ${text(item.command) ?? "a command"}`;
      else if (item.type === "fileChange") line = "Editing files";
      else if (item.type === "mcpToolCall") line = `Using ${text(item.tool) ?? "a tool"}`;
      else if (item.type === "webSearch") line = "Searching the web";
      break;
    }
    case "opencode": {
      const part = record(value.part);
      const tool = text(part.tool) ?? text(record(value.tool).name);
      const state = text(record(part.state).status);
      if (tool && (state === null || state === "running")) line = `Using ${tool}`;
      break;
    }
    case "antigravity": {
      if (name === "tool_call") line = text(value.title) && `Using ${text(value.title)}`;
      break;
    }
  }
  return line ? clip(line) : null;
}

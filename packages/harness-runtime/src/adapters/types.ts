import type { HarnessAgent, HarnessEvent } from "@startup-os/contracts/harness";

import type { McpLease } from "../mcp.ts";

/* oxlint-disable deslop/no-unknown-parameters -- Native response payloads have different protocols; each adapter validates its own wire boundary. */

type AdapterEvent = HarnessEvent extends infer E
  ? E extends HarnessEvent
    ? Omit<E, "sessionId" | "organizationId" | "timestamp">
    : never
  : never;
export interface AdapterContext {
  model?: HarnessAgent["model"];
  directory: string;
  executable: string;
  lease?: McpLease;
  emit(event: AdapterEvent): void;
}
export interface NativeAdapter {
  readonly nativeSessionId: string;
  prompt(text: string): Promise<void>;
  interrupt(): Promise<void>;
  respond(requestId: string, response: unknown): Promise<void>;
  disconnect(): Promise<void>;
}

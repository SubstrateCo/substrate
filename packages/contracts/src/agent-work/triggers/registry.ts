import type { InboxLane, InboxSource } from "../turns.ts";

export interface TriggerDefinition {
  origin: "server" | "local";
  principal: "owner" | "caller" | "system" | "agent";
  lane: InboxLane;
  turnMode: "interactive" | "unattended";
  steerable: boolean;
  /** owner_source: the owner must still see the message. caller_source: also the call. */
  recheck: "owner_source" | "caller_source" | "none";
  envelope: "message" | "decision" | "helper_task" | "helper_result" | "routine" | "system";
}

export const triggerRegistry: Record<InboxSource, TriggerDefinition> = {
  owner_message: {
    origin: "server",
    principal: "owner",
    lane: "owner",
    turnMode: "interactive",
    steerable: true,
    recheck: "owner_source",
    envelope: "message",
  },
  answer: {
    origin: "server",
    principal: "owner",
    lane: "owner",
    turnMode: "interactive",
    steerable: true,
    recheck: "none",
    envelope: "decision",
  },
  approval_result: {
    origin: "server",
    principal: "owner",
    lane: "owner",
    turnMode: "interactive",
    steerable: true,
    recheck: "none",
    envelope: "decision",
  },
  routine: {
    origin: "local",
    principal: "system",
    lane: "background",
    turnMode: "unattended",
    steerable: false,
    recheck: "none",
    envelope: "routine",
  },
  helper_task: {
    origin: "local",
    principal: "agent",
    lane: "system",
    turnMode: "unattended",
    steerable: false,
    recheck: "none",
    envelope: "helper_task",
  },
  helper_result: {
    origin: "local",
    principal: "agent",
    lane: "background",
    turnMode: "unattended",
    steerable: false,
    recheck: "none",
    envelope: "helper_result",
  },
  recovery: {
    origin: "local",
    principal: "system",
    lane: "system",
    turnMode: "unattended",
    steerable: false,
    recheck: "none",
    envelope: "system",
  },
  epoch: {
    origin: "local",
    principal: "system",
    lane: "system",
    turnMode: "unattended",
    steerable: false,
    recheck: "none",
    envelope: "system",
  },
  caller_message: {
    origin: "server",
    principal: "caller",
    lane: "caller",
    turnMode: "interactive",
    steerable: true,
    recheck: "caller_source",
    envelope: "message",
  },
};

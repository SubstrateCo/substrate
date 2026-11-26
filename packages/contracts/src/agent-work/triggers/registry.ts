import type { InboxLane, InboxSource } from "../turns.ts";

export interface TriggerDefinition {
  /** server: admission creates it. host: the agent's home host submits it, and admission checks the home. */
  origin: "server" | "host";
  principal: "owner" | "system" | "agent";
  lane: InboxLane;
  turnMode: "interactive" | "unattended";
  steerable: boolean;
  /** Passive context can join a live turn, but cannot create one. */
  canStartTurn: boolean;
  /** owner_source: the owner must still see the message. */
  recheck: "owner_source" | "none";
  envelope: "message" | "decision" | "helper_task" | "helper_result" | "routine" | "system";
}

export const triggerRegistry: Record<InboxSource, TriggerDefinition> = {
  owner_message: {
    origin: "server",
    principal: "owner",
    lane: "owner",
    turnMode: "interactive",
    steerable: true,
    canStartTurn: true,
    recheck: "owner_source",
    envelope: "message",
  },
  answer: {
    origin: "server",
    principal: "owner",
    lane: "owner",
    turnMode: "interactive",
    steerable: true,
    canStartTurn: true,
    recheck: "none",
    envelope: "decision",
  },
  approval_result: {
    origin: "server",
    principal: "owner",
    lane: "owner",
    turnMode: "interactive",
    steerable: true,
    canStartTurn: true,
    recheck: "none",
    envelope: "decision",
  },
  routine: {
    origin: "server",
    principal: "system",
    lane: "background",
    turnMode: "unattended",
    steerable: false,
    canStartTurn: true,
    recheck: "none",
    envelope: "routine",
  },
  helper_task: {
    origin: "server",
    principal: "agent",
    lane: "system",
    turnMode: "unattended",
    steerable: false,
    canStartTurn: true,
    recheck: "none",
    envelope: "helper_task",
  },
  helper_result: {
    origin: "server",
    principal: "agent",
    lane: "background",
    turnMode: "unattended",
    steerable: false,
    canStartTurn: true,
    recheck: "none",
    envelope: "helper_result",
  },
  recovery: {
    origin: "host",
    principal: "system",
    lane: "system",
    turnMode: "unattended",
    steerable: false,
    canStartTurn: true,
    recheck: "none",
    envelope: "system",
  },
  epoch: {
    origin: "host",
    principal: "system",
    lane: "system",
    turnMode: "unattended",
    steerable: false,
    canStartTurn: true,
    recheck: "none",
    envelope: "system",
  },
  thread_context: {
    origin: "server",
    principal: "system",
    lane: "background",
    turnMode: "unattended",
    steerable: true,
    canStartTurn: false,
    recheck: "owner_source",
    envelope: "message",
  },
};

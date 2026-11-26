import {
  hostFinishResult,
  hostRetryLaterResult,
  hostSteerResult,
  hostSteerResultResult,
  hostSubmitItemResult,
  hostTurnsResult,
  hostTurnStatusResult,
  recoveryDecision,
} from "@substrate/contracts/agent-work/control";

import type { HostApi, HostFinish, HostProgress } from "../ports.ts";
import type { ServerCall } from "./agent-work-server.ts";
import type { z } from "zod";

/** The control-plane client over `/agent-work/host/*`. */
export function createHostApi(options: { call: ServerCall; installationId: string }): HostApi {
  const { call } = options;
  const device = (organizationId: string) => ({
    organizationId,
    installationId: options.installationId,
  });
  const turn = (turnId: string, action: string) =>
    `/agent-work/host/turns/${encodeURIComponent(turnId)}/${action}`;
  /** Finish and progress bodies hold optional fields, which the JSON type does not model. */
  const json = (organizationId: string, value: HostFinish | HostProgress) =>
    // SAFETY: both bodies are built from contract values that serialize as plain JSON.
    ({ ...device(organizationId), ...value }) as z.core.util.JSONType;

  return {
    async claim(organizationId, busyFolders) {
      const result = await call(
        "/agent-work/host/claim",
        { ...device(organizationId), busyFolders },
        hostTurnsResult,
      );
      return result.turns;
    },
    async sync(organizationId) {
      return (await call("/agent-work/host/sync", device(organizationId), hostTurnsResult)).turns;
    },
    async start(organizationId, turnId, input) {
      const result = await call(
        turn(turnId, "start"),
        { ...device(organizationId), ...input },
        hostTurnStatusResult,
      );
      return result.status;
    },
    async progress(organizationId, turnId, input) {
      const result = await call(
        turn(turnId, "progress"),
        json(organizationId, input),
        hostTurnStatusResult,
      );
      return result.status;
    },
    finish: (organizationId, turnId, input) =>
      call(turn(turnId, "finish"), json(organizationId, input), hostFinishResult),
    async retryLater(organizationId, turnId, input) {
      const result = await call(
        turn(turnId, "retry-later"),
        { ...device(organizationId), ...input },
        hostRetryLaterResult,
      );
      return result.result;
    },
    recover: (organizationId, turnId, input) =>
      call(turn(turnId, "recover"), { ...device(organizationId), ...input }, recoveryDecision),
    steer: (organizationId, turnId, input) =>
      call(turn(turnId, "steer"), { ...device(organizationId), ...input }, hostSteerResult),
    async steerResult(organizationId, itemId, input) {
      await call(
        `/agent-work/host/items/${encodeURIComponent(itemId)}/steer-result`,
        { ...device(organizationId), ...input },
        hostSteerResultResult,
      );
    },
    async submitEpoch(organizationId, input) {
      const result = await call(
        "/agent-work/host/items",
        { ...device(organizationId), source: "epoch", ...input },
        hostSubmitItemResult,
      );
      return result.created;
    },
  };
}

import type { DatabaseExecutor } from "../../client";
import { committedWrite } from "../../core/effects";
import {
  requireDevice,
  type DeviceIdentity,
  type ResolvedDeviceIdentity,
} from "../../core/session/device";
import * as callers from "../agents/callers";
import * as decisions from "./decisions";
import * as requests from "./device-requests";
import * as invocations from "./invocations";
import * as sources from "./sources";
import * as status from "./status";
import * as wakes from "./wakes";

export const approveProposal = committedWrite(decisions.approveProposalInTransaction);
export const declineProposal = committedWrite(decisions.declineProposalInTransaction);
export const respondToRequest = committedWrite(decisions.respondToRequestInTransaction);
function deviceWrite<A extends unknown[], R>(
  write: (db: DatabaseExecutor, identity: ResolvedDeviceIdentity, ...args: A) => Promise<R>,
) {
  return committedWrite(async (tx: DatabaseExecutor, identity: DeviceIdentity, ...args: A) => {
    const device = await requireDevice(tx, identity);
    return write(tx, { ...identity, deviceId: device.id }, ...args);
  });
}

export const openRequest = deviceWrite(requests.openRequestForDevice);
export const closeRequest = deviceWrite(requests.closeRequestForDevice);
export const publishStatus = deviceWrite(status.publishStatusForDevice);
export const pullWakes = deviceWrite(wakes.pullWakesForDevice);
export const ackWakes = deviceWrite(wakes.ackWakesForDevice);
// The source check drops revoked calls, so it publishes their hints.
export const loadSources = deviceWrite(sources.loadSourcesForDevice);
export const decideInvocation = committedWrite(invocations.decideInvocationInTransaction);
export const saveCallerPolicy = committedWrite(callers.saveCallerPolicyInTransaction);
export const allowCaller = committedWrite(callers.allowCallerInTransaction);
export const removeCaller = committedWrite(callers.removeCallerInTransaction);

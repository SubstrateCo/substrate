import { committedWrite } from "../../core/effects";
import * as callers from "../agents/callers";
import * as decisions from "./decisions";
import * as requests from "./device-requests";
import * as invocations from "./invocations";
import * as sources from "./sources";
import * as status from "./status";
import * as wakes from "./wakes";

export const approveProposal = committedWrite(decisions.approveProposal);
export const declineProposal = committedWrite(decisions.declineProposal);
export const respondToRequest = committedWrite(decisions.respondToRequest);
export const openRequest = committedWrite(requests.openRequest);
export const closeRequest = committedWrite(requests.closeRequest);
export const publishStatus = committedWrite(status.publishStatus);
export const pullWakes = committedWrite(wakes.pullWakes);
export const ackWakes = committedWrite(wakes.ackWakes);
// The source check drops revoked calls, so it publishes their hints.
export const loadSources = committedWrite(sources.loadSources);
export const decideInvocation = committedWrite(invocations.decideInvocation);
export const saveCallerPolicy = committedWrite(callers.saveCallerPolicy);
export const allowCaller = committedWrite(callers.allowCaller);
export const removeCaller = committedWrite(callers.removeCaller);

/**
 * How long an interactive call that needs approval waits for the owner's decision, counted from
 * the start of the call. Claude Code stops an MCP call that sends no first byte within 60 s by
 * default; 45 s leaves room for the last decision read and the result's way back through the
 * worker.
 */
export const approvalWaitMs = 45_000;
export const approvalPollMs = 1_500;
const apiAnswerAllowanceMs = 15_000;
export const workspaceRequestTimeoutMs = approvalWaitMs + apiAnswerAllowanceMs;

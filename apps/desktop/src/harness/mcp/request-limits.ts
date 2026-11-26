/**
 * How long an interactive call that needs approval waits for the owner's decision, counted from
 * the start of the call. Claude Code stops an MCP call that sends no first byte within 60 s by
 * default; 45 s leaves room for the last decision read and the result's way back through the
 * worker.
 */
export const approvalWaitMs = 45_000;
/** How often a waiting call reads the decision. */
export const approvalPollMs = 1_500;
/** Room for a slow server call or decision read after the approval wait ends. */
const apiAnswerAllowanceMs = 15_000;
/**
 * How long the worker waits for main to answer one workspace api request. Main answers within
 * approvalWaitMs plus one server round trip, so the worker never gives up first.
 */
export const workspaceRequestTimeoutMs = approvalWaitMs + apiAnswerAllowanceMs;

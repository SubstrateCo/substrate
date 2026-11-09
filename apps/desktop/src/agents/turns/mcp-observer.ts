/* oxlint-disable deslop/no-unknown-parameters -- MCP bodies and results are passed on unparsed; toolOutputs parses them. */

const mcpCallPath = "/api/v1/mcp/call";

/**
 * Wraps main's API fetch so that every server tool call, with its result, is also reported to
 * agent work. The response the caller gets is unchanged.
 */
export function observeMcpCalls(
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>,
  onCall: (request: unknown, result: unknown) => void,
) {
  return async (url: string, init: RequestInit) => {
    const response = await fetchAPI(url, init);
    // oxlint-disable-next-line deslop/no-runtime-typeof -- Request bodies from the MCP proxy are JSON strings.
    if (new URL(url).pathname !== mcpCallPath || typeof init.body !== "string") return response;
    try {
      const request: unknown = JSON.parse(init.body);
      void response
        .clone()
        .json()
        .then(
          (result: unknown) => onCall(request, result),
          () => {},
        );
    } catch {
      /* Not JSON: nothing to record. */
    }
    return response;
  };
}

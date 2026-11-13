import type { JSONValue } from "k6";

/** Only routing identifiers belong in failure logs, never request bodies or credentials. */
export function failureTargets(input: Record<string, JSONValue | undefined>) {
  return Object.fromEntries(
    [
      "organizationId",
      "conversationId",
      "projectEntityId",
      "taskEntityId",
      "entityId",
      "messageId",
      "messageIds",
    ].flatMap((key) => (input[key] === undefined ? [] : [[key, input[key]]])),
  );
}

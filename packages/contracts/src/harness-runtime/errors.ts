import { z } from "zod";

export type HarnessErrorClassification = "transient" | "definitive" | "undelivered";

/** Retry policy and, for steer, proof that the input never reached a live turn. */
export const harnessErrors = {
  INVALID_INPUT: ["definitive"],
  "agent-disabled": ["definitive"],
  "agent-not-found": ["definitive"],
  "agent-not-home": ["definitive"],
  "binary-not-found": ["definitive"],
  "compact-unsupported": ["definitive"],
  disconnected: ["transient"],
  disposed: ["transient"],
  "duplicate-id": ["definitive"],
  "empty-input": ["definitive"],
  "event-stream": ["definitive"],
  "event-timeout": ["definitive"],
  "harness-error": ["transient"],
  "harness-unavailable": ["transient", "undelivered"],
  "invalid-command": ["definitive", "undelivered"],
  "invalid-config": ["definitive"],
  "invalid-endpoint": ["definitive"],
  "invalid-harness": ["definitive"],
  "invalid-id": ["definitive"],
  "invalid-model": ["definitive"],
  "invalid-protocol": ["definitive"],
  "invalid-response": ["definitive"],
  "invalid-skill": ["definitive"],
  "invalid-skill-name": ["definitive"],
  "invalid-turn-context": ["definitive"],
  "native-auth-required": ["definitive"],
  "native-request": ["definitive"],
  "no-live-turn": ["definitive", "undelivered"],
  "no-turn": ["definitive"],
  "not-connected": ["transient", "undelivered"],
  "not-initialized": ["transient", "undelivered"],
  "organization-not-configured": ["transient"],
  "organization-unavailable": ["transient", "undelivered"],
  "process-exit": ["definitive"],
  "process-spawn": ["definitive"],
  "process-timeout": ["transient"],
  "process-write": ["definitive"],
  "protocol-limit": ["definitive"],
  "request-cancelled": ["definitive"],
  "request-timeout": ["transient"],
  "resume-failed": ["definitive"],
  "session-boundary": ["definitive"],
  "session-changed": ["transient"],
  "session-closing": ["transient"],
  "session-conflict": ["definitive"],
  "steer-unsupported": ["definitive", "undelivered"],
  timeout: ["transient"],
  "turn-active": ["transient", "undelivered"],
  "turn-not-live": ["definitive", "undelivered"],
  "unknown-request": ["definitive"],
  "unsafe-path": ["definitive"],
  "unsupported-capability": ["definitive"],
  "worker-stopped": ["transient"],
} as const satisfies Record<string, readonly HarnessErrorClassification[]>;

export type HarnessErrorCode = keyof typeof harnessErrors;
// SAFETY: Object.keys of a literal object returns exactly its own keys, and the registry is not empty.
export const harnessErrorCodes = Object.keys(harnessErrors) as [
  HarnessErrorCode,
  ...HarnessErrorCode[],
];
const harnessErrorCodeSchema = z.enum(harnessErrorCodes);

export function isHarnessErrorCode(code: unknown): code is HarnessErrorCode {
  return harnessErrorCodeSchema.safeParse(code).success;
}

export function harnessCodesWithClassification(classification: HarnessErrorClassification) {
  return new Set<string>(
    harnessErrorCodes.filter((code) =>
      harnessErrors[code].some((value) => value === classification),
    ),
  );
}

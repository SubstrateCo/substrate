export type SendRequest = { id: string; fingerprint: string };

export function sendFingerprint(body: string, attachmentFileIds: readonly string[]): string {
  return JSON.stringify([body, attachmentFileIds]);
}

/**
 * The request ID for a send. Retrying the same content reuses the ID, so a send whose response
 * was lost is not posted twice. Changed content is a new message and gets a new ID.
 */
export function sendRequestFor(
  previous: SendRequest | undefined,
  body: string,
  attachmentFileIds: readonly string[],
  createId: () => string,
): SendRequest {
  const fingerprint = sendFingerprint(body, attachmentFileIds);
  if (previous?.fingerprint === fingerprint) return previous;
  return { id: createId(), fingerprint };
}

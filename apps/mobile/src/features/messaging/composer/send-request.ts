export type SendRequest = { id: string; fingerprint: string };

function sendFingerprint(body: string, attachmentFileIds: readonly string[]): string {
  return JSON.stringify([body, attachmentFileIds]);
}

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

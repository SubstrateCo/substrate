import { mailFlag } from "@substrate/contracts/mail";

import { z } from "zod";

export const gmailFlags = new Map(
  Object.entries(mailFlag).map(([key, value]) => [
    key === "drafts" ? "DRAFT" : key.toUpperCase(),
    value,
  ]),
);
export const flagsFor = (labels: string[]) =>
  labels.reduce((bits, label) => bits | (gmailFlags.get(label) ?? 0), 0);

export function gmailMessageState(id?: string) {
  return z
    .object({
      id: id === undefined ? z.string().min(1) : z.literal(id),
      labelIds: z.array(z.string()).default([]),
    })
    .transform(({ id: remoteId, labelIds }) => ({ remoteId, flags: flagsFor(labelIds), labelIds }));
}

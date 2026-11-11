import type { RealtimeHint } from "@substrate/contracts/realtime";
import type { Committed } from "@substrate/database";

import { sharingMailWorker } from "../messaging/sharing-mail";
import { publishRefresh } from "./publisher";

export function createCommittedPublisher(dependencies: {
  publish: (hints: RealtimeHint[]) => Promise<void>;
  sharingMail: { trigger: () => void };
}) {
  return async <T>(committed: Committed<T>): Promise<T> => {
    await dependencies.publish(committed.hints);
    if (committed.mail?.includes("sharing")) dependencies.sharingMail.trigger();
    return committed.result;
  };
}

export const publishCommitted = createCommittedPublisher({
  publish: publishRefresh,
  sharingMail: sharingMailWorker,
});

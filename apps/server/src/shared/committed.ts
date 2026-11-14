import type { RealtimeHint } from "@substrate/contracts/realtime";
import type { Committed } from "@substrate/database";

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

export type CommittedPublisher = ReturnType<typeof createCommittedPublisher>;

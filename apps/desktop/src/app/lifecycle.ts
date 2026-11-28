export function createLifecycle(steps: {
  stopAgentWork(): void | Promise<void>;
  closeSessions(): void | Promise<void>;
  disposeWorker(): void | Promise<void>;
  disconnectRealtime(): void;
}) {
  let pending: Promise<void> | undefined;
  return {
    shutdown() {
      pending ??= (async () => {
        try {
          await steps.stopAgentWork();
        } finally {
          try {
            await steps.closeSessions();
          } finally {
            steps.disconnectRealtime();
            await steps.disposeWorker();
          }
        }
      })().finally(() => {
        pending = undefined;
      });
      return pending;
    },
  };
}

type Identity = { userId: string; verified: boolean };

export function createAttentionSession({
  apply,
  token,
  readIdentity,
}: {
  apply: (count: number) => void;
  token: () => string;
  readIdentity: () => Promise<Identity | null>;
}) {
  let revision = 0;
  let suspended = false;
  const clear = () => {
    revision++;
    apply(0);
  };
  return {
    clear,
    suspend() {
      suspended = true;
      clear();
    },
    resume() {
      suspended = false;
    },
    async set({ userId, count }: { userId: string; count: number }) {
      if (suspended) return;
      const current = ++revision;
      const cookie = token();
      const identity = await readIdentity();
      const sameSession = current === revision && cookie === token();
      if (!sameSession || !identity?.verified || identity.userId !== userId) return;
      apply(count);
    },
  };
}

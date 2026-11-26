/** One uncached read closes the private boundary until authoritative state is published. */
export function createSessionRevalidator<Session>({
  close,
  clear,
  read,
  publish,
  open,
}: {
  close: () => void;
  clear: () => void;
  read: () => Promise<Session | null>;
  publish: (session: Session | null) => void;
  open: () => void;
}) {
  let pending: Promise<void> | undefined;
  return () => {
    if (pending) return pending;
    close();
    clear();
    pending = (async () => {
      try {
        publish(await read());
      } catch (error) {
        publish(null);
        throw error;
      } finally {
        open();
        pending = undefined;
      }
    })();
    return pending;
  };
}
export async function readUncachedSession<Session>(
  read: (options: { query: { disableCookieCache: true } }) => Promise<{
    data: Session | null;
    error: { message?: string } | null;
  }>,
) {
  const response = await read({ query: { disableCookieCache: true } });
  if (response.error) throw new Error(response.error.message ?? "Could not refresh your session.");
  return response.data;
}

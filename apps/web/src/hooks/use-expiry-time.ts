import { useEffect, useState } from "react";

const maxDelay = 2 ** 31 - 1;

/**
 * Returns a time to compare expiry dates with. It changes only when the next expiry passes,
 * so lists do not render again every second.
 */
export function useExpiryTime(expiries: readonly (string | Date)[] = []) {
  const [now, setNow] = useState(Date.now);
  const next = Math.min(
    ...expiries.flatMap((expiry) => {
      const time = new Date(expiry).getTime();
      return time >= now ? [time] : [];
    }),
  );
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    let timer: ReturnType<typeof setTimeout>;
    // Waits again until the expiry has passed: browsers cap timer delays near 24.8 days, and a
    // timer can fire early when the clock changes.
    const wait = () => {
      const delay = next - Date.now() + 1;
      timer = setTimeout(
        delay > 0 ? wait : () => setNow(Date.now()),
        Math.min(Math.max(delay, 0), maxDelay),
      );
    };
    wait();
    return () => clearTimeout(timer);
  }, [next]);
  return now;
}

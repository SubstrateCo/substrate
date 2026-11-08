import { useEffect, useState } from "react";

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
    // Browsers cap timer delays near 24.8 days; a capped timer schedules again when it fires.
    const delay = Math.min(next - Date.now() + 1, 2 ** 31 - 1);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(delay, 0));
    return () => clearTimeout(timer);
  }, [next, now]);
  return now;
}

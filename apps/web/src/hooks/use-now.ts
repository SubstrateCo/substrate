import { useEffect, useState } from "react";

/** The current time, updated every interval while active. Inactive callers do not render again. */
export function useNow(active: boolean, interval = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [active, interval]);
  return now;
}

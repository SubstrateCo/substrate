import { useEffect, useState } from "react";

export function useNow(active: boolean, interval = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = undefined;
      if (document.visibilityState === "hidden") return;
      timer = setInterval(() => setNow(Date.now()), interval);
    };
    const resync = () => {
      if (document.visibilityState !== "hidden") setNow(Date.now());
      start();
    };
    start();
    document.addEventListener("visibilitychange", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      clearInterval(timer);
    };
  }, [active, interval]);
  return now;
}

import type { Clock } from "./timers.ts";

export function manualClock(start: number) {
  let now = start;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: Clock & { advance(ms: number): void; set(at: number): void } = {
    now: () => now,
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { at: now + Math.max(delay, 0), callback });
      return () => timers.delete(id);
    },
    advance(ms) {
      clock.set(now + ms);
    },
    set(at) {
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= at)
          .sort(([a, x], [b, y]) => x.at - y.at || a - b)
          .at(0);
        if (!due) break;
        timers.delete(due[0]);
        now = Math.max(now, due[1].at);
        due[1].callback();
      }
      now = at;
    },
  };
  return clock;
}

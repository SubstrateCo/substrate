export type CancelTimer = () => void;

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, delay: number): CancelTimer;
}

// Node timers overflow above this delay and fire at once.
const maxDelay = 2 ** 31 - 1;

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => {
    const handle = setTimeout(callback, Math.min(Math.max(delay, 0), maxDelay));
    handle.unref();
    return () => clearTimeout(handle);
  },
};

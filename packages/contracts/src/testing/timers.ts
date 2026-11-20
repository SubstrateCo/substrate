import { vi } from "bun:test";

// bun:test leaves setImmediate real while fake timers are on, so this waits for every pending
// promise job without moving the fake clock.
const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Advances Bun's fake clock by `ms` and lets promise jobs run between timers.
 *
 * Bun 1.4 has only the synchronous `advanceTimersByTime`. A timer that a callback schedules
 * after an `await` would otherwise wait for the next advance. Replace this with
 * `vi.advanceTimersByTimeAsync` when Bun provides it.
 */
export async function advanceTimersAsync(ms = 0) {
  await drain();
  vi.advanceTimersByTime(0);
  await drain();
  for (let elapsed = 0; elapsed < ms; elapsed++) {
    vi.advanceTimersByTime(1);
    await drain();
  }
}

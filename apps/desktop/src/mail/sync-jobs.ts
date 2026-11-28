import { addAbortListener } from "node:events";

type Job = {
  again: boolean;
  done: Promise<void>;
};

export function mailboxSyncJobs() {
  const jobs = new Map<string, Job>();
  const lanes = new Map<string, { controller: AbortController; done: Promise<unknown> }>();
  // Google can rotate a refresh token. Sync and explicit paging must not refresh the
  // same grant concurrently. Waiting never holds a SQLite transaction or another mailbox.
  function run<T>(id: string, work: (signal: AbortSignal) => Promise<T>, caller?: AbortSignal) {
    const previous = lanes.get(id);
    const controller = previous?.controller ?? new AbortController();
    const signal = caller ? AbortSignal.any([controller.signal, caller]) : controller.signal;
    const invoke = async () => {
      signal.throwIfAborted();
      return work(signal);
    };
    const done = previous ? previous.done.then(invoke, invoke) : invoke();
    const lane = { controller, done };
    lanes.set(id, lane);
    const clear = () => {
      if (lanes.get(id) === lane) lanes.delete(id);
    };
    void done.then(clear, clear);
    if (!caller) return done;
    const cancelled = Promise.withResolvers<never>();
    const listener = addAbortListener(signal, () => cancelled.reject(signal.reason));
    return Promise.race([done, cancelled.promise]).finally(() => listener[Symbol.dispose]());
  }
  function request(id: string, work: (signal: AbortSignal) => Promise<void>) {
    const existing = jobs.get(id);
    if (existing) {
      if (!lanes.get(id)?.controller.signal.aborted) existing.again = true;
      return existing.done;
    }
    const job: Job = { again: false, done: Promise.resolve() };
    jobs.set(id, job);
    job.done = run(id, async (signal) => {
      for (;;) {
        await work(signal);
        if (!job.again || signal.aborted) break;
        job.again = false;
      }
    }).finally(() => jobs.delete(id));
    return job.done;
  }
  async function cancel(id: string) {
    const job = lanes.get(id);
    if (!job) return;
    job.controller.abort();
    await job.done.catch(() => {});
  }
  return {
    run,
    request,
    has: (id: string) => jobs.has(id),
    cancel,
    stop: () => Promise.all([...lanes.keys()].map(cancel)),
  };
}

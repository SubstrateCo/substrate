export interface FrameTask {
  /**
   * Draws every `n`th frame. Avatars return 2 when small or when many are running; their
   * `phase` staggers them, so each frame carries about the same work.
   */
  every(running: number): number;
  phase: number;
  /** Layout reads, run for every due task before any task writes. */
  read?(now: number): void;
  write(now: number): void;
}

/** Avatars this small draw every other frame (30 fps); the difference is not visible. */
const SMALL_SIZE = 32;
/** With more avatars than this animating, those up to `CROWD_SIZE` px also draw at 30 fps. */
const CROWD = 40;
const CROWD_SIZE = 64;

/** The `every` of an avatar `size` px wide while `running` avatars animate. */
export function avatarStride(size: number, running: number): number {
  return size <= SMALL_SIZE || (running > CROWD && size <= CROWD_SIZE) ? 2 : 1;
}

const tasks = new Set<FrameTask>();
const due: FrameTask[] = [];
let handle = 0;
let frameIndex = 0;
let averageCost = 0;

function loop(now: number) {
  const start = performance.now();
  frameIndex++;
  due.length = 0;
  for (const task of tasks) {
    if ((frameIndex + task.phase) % task.every(tasks.size) === 0) due.push(task);
  }
  for (const task of due) task.read?.(now);
  for (const task of due) task.write(now);
  averageCost += (performance.now() - start - averageCost) * 0.05;
  handle = tasks.size > 0 ? requestAnimationFrame(loop) : 0;
}

/**
 * Every avatar shares one animation frame loop. Reads and writes run in separate passes,
 * so many avatars never force layout more than once per frame.
 */
export function subscribeFrames(task: FrameTask): () => void {
  tasks.add(task);
  if (!handle) handle = requestAnimationFrame(loop);
  return () => {
    tasks.delete(task);
    if (tasks.size === 0 && handle) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
}

/** Script time the shared loop spends per frame (smoothed ms) and how many avatars it runs. */
export function frameStats() {
  return { cost: averageCost, running: tasks.size };
}

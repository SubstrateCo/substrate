export interface FrameTask {
  every(running: number): number;
  phase: number;
  read?(now: number): void;
  write(now: number): void;
}

const SMALL_SIZE = 32;
const CROWD = 40;
const CROWD_SIZE = 64;

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

export function frameStats() {
  return { cost: averageCost, running: tasks.size };
}

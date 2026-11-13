type Child = Pick<ReturnType<typeof Bun.spawn>, "exitCode" | "exited" | "kill" | "unref">;

async function exitedWithin(child: Child, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      child.exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function stopChild(child: Child) {
  if (child.exitCode !== null) return;
  child.kill();
  if (await exitedWithin(child, 3_000)) return;
  child.kill("SIGKILL");
  if (await exitedWithin(child, 3_000)) return;
  child.unref();
  throw new Error("Child did not exit after forced termination.");
}

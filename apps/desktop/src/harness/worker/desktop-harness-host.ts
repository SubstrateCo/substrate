import { HarnessStore } from "@startup-os/client-storage";
import {
  createHarnessHost,
  type HarnessHostOptions,
  type RuntimeHarnessHost,
} from "@startup-os/harness-runtime";

import { lstat, mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

export async function createDesktopHarnessHost(
  options: Omit<HarnessHostOptions, "storage"> & { migrationsDirectory?: string },
): Promise<RuntimeHarnessHost> {
  await mkdir(options.accountDirectory, { recursive: true });
  const accountDirectory = await realpath(options.accountDirectory);
  const directory = join(accountDirectory, ".startup-os");
  const path = join(directory, "harness-metadata.sqlite");
  for (const managed of [directory, path]) {
    const stat = await lstat(managed).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (stat?.isSymbolicLink())
      throw new Error("Local storage paths cannot contain symlinks or junctions.");
    if (!stat && managed === directory) await mkdir(directory);
  }
  const storage = await HarnessStore.open(path, options.migrationsDirectory);
  try {
    const host = await createHarnessHost({ ...options, accountDirectory, storage });
    let disposal: Promise<void> | undefined;
    return {
      ...host,
      dispose() {
        return (disposal ??= host.dispose().finally(() => storage.close()));
      },
    };
  } catch (error) {
    storage.close();
    throw error;
  }
}

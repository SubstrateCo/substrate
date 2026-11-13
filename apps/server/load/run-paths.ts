import { fileURLToPath } from "node:url";

export function baselinePaths(moduleUrl: string, label: string) {
  const root = resolve(fileURLToPath(new URL("../../../", moduleUrl)));
  const data = resolve(fileURLToPath(new URL("./.data/", moduleUrl)));
  return { root, data, directory: resolve(data, label) };
}
import { resolve } from "node:path";

import { resolve, sep } from "node:path";

export function staticFilePath(directory: string, pathname: string) {
  if (!pathname.startsWith("/")) return;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return;
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return;
  const root = resolve(directory);
  const path = resolve(root, decoded === "/" ? "index.html" : `.${decoded}`);
  if (path.startsWith(root + sep)) return path;
}

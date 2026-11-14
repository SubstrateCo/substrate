import type { DesktopScheme } from "@substrate/contracts/desktop/identity";
import { desktopLink, type desktopPath } from "@substrate/contracts/desktop/links";

import type { z } from "zod";

type DesktopPath = z.output<typeof desktopPath>;

export function openDesktop(path: DesktopPath, options: { scheme: DesktopScheme; webURL: string }) {
  const downloadURL = new URL("/download", options.webURL);
  downloadURL.searchParams.set("redirect", path);
  return {
    link: desktopLink(path, options.scheme),
    browserURL: new URL(path, options.webURL).toString(),
    downloadURL: downloadURL.toString(),
  };
}

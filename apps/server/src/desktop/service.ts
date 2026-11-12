import type { DesktopScheme } from "@substrate/contracts/desktop/identity";
import { desktopLink, desktopPath } from "@substrate/contracts/desktop/links";
import { publicFailure, success, type ServiceResult } from "@substrate/contracts/result";

/** The public /desktop/open page for a destination. Throws when the validator rejects it. */
export function desktopHandoffURL(path: string, apiURL: string) {
  const url = new URL("/desktop/open", apiURL);
  url.searchParams.set("path", desktopPath.parse(path));
  return url.toString();
}

export function openDesktop(
  path: string,
  scheme: DesktopScheme = "substrate",
): ServiceResult<{ link: string }> {
  const result = desktopPath.safeParse(path);
  if (!result.success) return publicFailure("INVALID_INPUT", "Invalid desktop destination.");
  return success({ link: desktopLink(result.data, scheme) });
}

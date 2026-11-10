import { desktopLink, desktopPath } from "@startup-os/contracts/desktop/links";
import { failure, success, type ServiceResult } from "@startup-os/contracts/result";

/** The public /desktop/open page for a destination. Throws when the validator rejects it. */
export function desktopHandoffURL(path: string, apiURL: string) {
  const url = new URL("/desktop/open", apiURL);
  url.searchParams.set("path", desktopPath.parse(path));
  return url.toString();
}

export function openDesktop(path: string): ServiceResult<{ link: string }> {
  const result = desktopPath.safeParse(path);
  if (!result.success) return failure("INVALID_INPUT", "Invalid desktop destination.");
  return success({ link: desktopLink(result.data) });
}

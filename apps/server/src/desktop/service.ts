import { desktopLink, desktopPath } from "@startup-os/contracts/desktop/links";
import { failure, success, type ServiceResult } from "@startup-os/contracts/result";

export function openDesktop(path: string): ServiceResult<{ link: string }> {
  const result = desktopPath.safeParse(path);
  if (!result.success) return failure("INVALID_INPUT", "Invalid desktop destination.");
  return success({ link: desktopLink(result.data) });
}

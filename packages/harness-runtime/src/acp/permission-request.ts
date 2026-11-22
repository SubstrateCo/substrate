import { HarnessError } from "../errors.ts";
import type { AcpClientRequest } from "./driver.ts";

type PermissionResponse = {
  outcome: { outcome: "cancelled" } | { outcome: "selected"; optionId: string };
};

const cancelledPermission: PermissionResponse = { outcome: { outcome: "cancelled" } };

export function permissionRequest(request: {
  sessionId: string;
  options: { kind: string; optionId: string }[];
}): AcpClientRequest<PermissionResponse> {
  const selected = (optionId: string): PermissionResponse => ({
    outcome: { outcome: "selected", optionId },
  });
  return {
    kind: "permission",
    sessionId: request.sessionId,
    data: request,
    deny: () => {
      const reject =
        request.options.find((option) => option.kind === "reject_once") ??
        request.options.find((option) => option.kind === "reject_always");
      return reject ? selected(reject.optionId) : cancelledPermission;
    },
    cancelled: () => cancelledPermission,
    parse: (response) => {
      if (response === null || response === undefined) return cancelledPermission;
      const option = request.options.find((entry) => entry.optionId === response);
      if (!option)
        throw new HarnessError(
          "invalid-response",
          "Choose one of the native permission option IDs.",
        );
      return selected(option.optionId);
    },
  };
}

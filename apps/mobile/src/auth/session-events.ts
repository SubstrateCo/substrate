import type { RealtimeDomain } from "@substrate/contracts/realtime";

export function changeRevalidatesSession(domain: RealtimeDomain): boolean {
  return domain === "organization";
}

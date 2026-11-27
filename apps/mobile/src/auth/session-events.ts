import type { RealtimeDomain } from "@substrate/contracts/realtime";

/**
 * Whether a realtime change can alter the signed-in session, such as its organizations or roles,
 * so the session is checked again. Profile changes (names, pictures, agent looks) only refresh
 * data: checking the session closes private screens, such as a sheet the person is using.
 */
export function changeRevalidatesSession(domain: RealtimeDomain): boolean {
  return domain === "organization";
}

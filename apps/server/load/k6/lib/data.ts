import type { LoadUser, LoadOrganization } from "../../types.ts";
import { maxConcurrentUsers, rankUsers } from "../../workload.ts";
import { config } from "./config.ts";
import { SharedArray } from "k6/data";

interface UsersFile {
  apiUrl: string;
  origin: string;
  password: string;
  organizations: LoadOrganization[];
  users: LoadUser[];
}

// open() resolves relative to this module.
const file = new SharedArray<UsersFile>("users-file", () => [
  // SAFETY: load/provision.ts writes this local fixture with the UsersFile shape.
  JSON.parse(open("../../.data/users.json")) as UsersFile,
]);

export const users = new SharedArray<LoadUser>("users", () => file[0]!.users);
const meta = file[0]!;
export const apiUrl = meta.apiUrl;
export const origin = meta.origin;
export const password = meta.password;
export const organizations = meta.organizations;

/**
 * Smoke and coverage keep fixture order so their few accounts collaborate. Measurement uses
 * a weighted permutation; the same slot always owns one unique account, including ramp-down.
 */
const rankedUsers = new SharedArray<LoadUser>("ranked-users", () =>
  rankUsers([...users], organizations),
);

export function userOf(vuId: number): LoadUser {
  if (vuId < 1 || vuId > maxConcurrentUsers || vuId > users.length)
    throw new Error(
      `No unique load account for VU ${vuId}; maximum ${Math.min(users.length, maxConcurrentUsers)}`,
    );
  return (config.mode === "smoke" || config.mode === "coverage" ? users : rankedUsers)[vuId - 1]!;
}

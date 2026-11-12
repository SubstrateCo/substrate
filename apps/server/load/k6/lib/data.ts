import type { LoadUser, LoadOrganization } from "../../types.ts";
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

const users = new SharedArray<LoadUser>("users", () => file[0]!.users);
const meta = file[0]!;
export const apiUrl = meta.apiUrl;
export const origin = meta.origin;
export const password = meta.password;
export const organizations = meta.organizations;

/**
 * The account of a VU, 1:1 while VUs do not exceed users. Smoke takes consecutive users, so its
 * few VUs share one organization and see each other's hints. Other modes spread VUs evenly over
 * the file, which lists users by organization, so every organization gets its share.
 */
export function userOf(vuId: number): LoadUser {
  const index =
    config.mode === "smoke"
      ? (vuId - 1) % users.length
      : Math.floor(((vuId - 1) * users.length) / Math.max(config.vus, 1)) % users.length;
  return users[Math.max(index, 0)]!;
}

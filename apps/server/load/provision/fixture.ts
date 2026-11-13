import type { FixtureCounts } from "../types";
import { createHash } from "node:crypto";

export const SEED_VERSION = 2;
export const SEED_PROFILE = "established-workspace";
export const CRM_RECORDS_PER_USER = 3;
export const FOLLOW_UPS_PER_USER = 4;
export const DISCUSSION_MESSAGES_PER_USER = 6;
export const DM_MESSAGES = 4;
export const GROUP_MESSAGES = 8;

export function requireNotificationMembers(distribution: number[]) {
  if (distribution.some((size) => size < 2))
    throw new Error(
      "Notification coverage requires at least two members in every organization. Increase LOAD_USERS (80 or more supports the fixed organization distribution).",
    );
}

export const channelCount = (members: number) => Math.max(4, Math.round(members / 5));
export const projectCount = (members: number) => Math.min(8, Math.max(3, Math.ceil(members / 8)));
export const projectTasks = (members: number, index: number) =>
  index === 0 ? members * 2 : Math.max(4, Math.ceil(members / 3));

/** 60% of channel history belongs to the hot, all-member channel. */
export function channelMessages(members: number, index: number) {
  const total = members * 20;
  const hot = Math.floor(total * 0.6);
  const rest = total - hot;
  const cold = channelCount(members) - 1;
  return index === 0 ? hot : Math.floor(rest / cold) + (index <= rest % cold ? 1 : 0);
}

export function fixtureCounts(sizes: number[]): FixtureCounts {
  const users = sizes.reduce((sum, size) => sum + size, 0);
  const sharedProjects = sizes.reduce((sum, size) => sum + projectCount(size), 0);
  const sharedTasks = sizes.reduce(
    (sum, size) =>
      sum +
      Array.from({ length: projectCount(size) }, (_, i) => projectTasks(size, i)).reduce(
        (a, b) => a + b,
        0,
      ),
    0,
  );
  const directMessages = sizes.reduce((sum, size) => {
    if (size < 3) return sum + size - 1;
    return sum + Math.min(size, 16);
  }, 0);
  const groups = sizes.reduce((sum, size) => sum + (size > 2 ? 3 : 0), 0);
  return {
    users,
    organizations: sizes.length,
    channels: sizes.reduce((sum, size) => sum + channelCount(size), 0),
    directMessages,
    groups,
    discussions: sharedProjects + users,
    projects: sharedProjects + users,
    tasks: sharedTasks + users * FOLLOW_UPS_PER_USER,
    messages:
      users * (20 + DISCUSSION_MESSAGES_PER_USER) +
      sharedProjects +
      directMessages * DM_MESSAGES +
      groups * GROUP_MESSAGES +
      users,
    notifications: users,
    accounts: users * CRM_RECORDS_PER_USER,
    contacts: users * CRM_RECORDS_PER_USER,
    deals: users * CRM_RECORDS_PER_USER,
    followUps: users * FOLLOW_UPS_PER_USER,
  };
}

/** Stable API idempotency keys, including across a reset of the isolated database. */
export function seedRequest(key: string) {
  const hex = createHash("sha256").update(`load:${SEED_VERSION}:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function localTarget(value: string) {
  const url = new URL(value);
  const localHttp =
    url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const credentialsOrQuery = url.username || url.password || url.search || url.hash;
  const originOnly = !credentialsOrQuery && url.pathname === "/";
  if (!localHttp || !url.port || !originOnly)
    throw new Error(`Load tests require an explicit local HTTP origin with a port: ${value}`);
  return url.origin;
}

export function provisioningTarget(target: { apiUrl: string; origin: string; mailpitUrl: string }) {
  for (const [name, port] of [
    ["apiUrl", "3201"],
    ["origin", "3200"],
    ["mailpitUrl", "8026"],
  ] as const) {
    if (new URL(localTarget(target[name])).port !== port)
      throw new Error(`Load ${name} must use the isolated local port ${port}.`);
  }
}

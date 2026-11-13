import type { LoadUser } from "../../types.ts";

/** Five initial invitees and three member additions must not consume active VU accounts. */
export function coverageHelpers(users: readonly LoadUser[], vus: number) {
  const active = users.slice(0, vus);
  const activeIds = new Set(active.map((user) => user.userId));
  const helpers = users.filter((user) => !activeIds.has(user.userId));
  for (const organizationId of new Set(active.map((user) => user.organizationId))) {
    const available = helpers.filter((user) => user.organizationId === organizationId);
    if (available.length < 8 || available.some((user) => !user.actorEntityId))
      throw new Error(
        `Coverage organization ${organizationId} needs at least 8 inactive helpers with actor IDs outside the first ${vus} users`,
      );
  }
  return helpers;
}

export function coverageChannel(name: string, emails: string[]) {
  return { kind: "channel" as const, name, private: true, emails };
}

/** Names reserved by provision/workspaces.ts, not channels made during a run. */
export function seededChannel(conversation: { kind: string; name: string }) {
  return (
    conversation.kind === "channel" &&
    (new Set([
      "general",
      "product",
      "engineering",
      "customer-success",
      "operations",
      "design",
      "sales",
      "research",
      "platform",
      "launch",
      "leadership",
      "watercooler",
    ]).has(conversation.name) ||
      /^team-\d+$/.test(conversation.name))
  );
}

export function ownedFixture(id: string, owned: Iterable<string>) {
  for (const ownId of owned) if (ownId === id) return true;
  return false;
}

export function coverageProject(
  id: string,
  owned: Iterable<string>,
  seededId: string | undefined,
  ownOnly: boolean,
) {
  return ownedFixture(id, owned) || (!ownOnly && id === seededId);
}

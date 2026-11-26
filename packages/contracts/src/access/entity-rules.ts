import type { OptionalAppId } from "../apps/index.ts";
import { calendarEntityRules } from "../calendar/access.ts";
import { contactEntityRules } from "../contacts/access.ts";
import { crmEntityRules } from "../crm/access.ts";
import { taskEntityRules } from "../tasks/access.ts";

/** Entity types. The database `entity_type` enum uses this list. */
export const entityTypes = [
  "actor",
  "contact",
  "contact_interaction",
  "project",
  "task",
  "account",
  "deal",
  "calendar",
  "calendar_event",
] as const;
export type EntityType = (typeof entityTypes)[number];

/**
 * Who reaches the records in a container without a grant.
 * - `grants`: only actors with a grant on the container.
 * - `admins`: grant holders, and organization owners and admins, who own every record.
 * - `members`: every member edits and admins own. Grants are ignored, so it cannot be shared.
 */
export type ContainerSharing = "grants" | "admins" | "members";

/**
 * A root entity is its own access container and sets its sharing. A child uses its parent's
 * container, so the parent's sharing applies to it.
 */
export type EntityAccessRule = {
  /** Optional apps that the organization must enable to read or create the record. */
  apps: readonly OptionalAppId[];
} & ({ sharing: ContainerSharing; parent?: never } | { parent: EntityType; sharing?: never });

/** Each domain registers the rules for the entity types it owns. */
export type EntityRules<Type extends EntityType = EntityType> = {
  readonly [Key in Type]: EntityAccessRule;
};

const coreEntityRules = {
  // Admins do not own actor records.
  actor: { apps: [], sharing: "grants" },
} as const satisfies EntityRules<"actor">;

/** Every entity type's rule. A new entity type does not compile until a domain registers it. */
export const entityAccessRules: EntityRules = {
  ...coreEntityRules,
  ...contactEntityRules,
  ...taskEntityRules,
  ...crmEntityRules,
  ...calendarEntityRules,
};

/** The sharing of the entity's container: its own for a root, its parent's for a child. */
export function containerSharing(type: EntityType): ContainerSharing {
  const rule: EntityAccessRule = entityAccessRules[type];
  return rule.parent ? containerSharing(rule.parent) : rule.sharing;
}

/** Root types whose containers use one of the given sharing rules. */
export function rootTypesWithSharing(...sharing: ContainerSharing[]): EntityType[] {
  return entityTypes.filter((type) => {
    const rule: EntityAccessRule = entityAccessRules[type];
    return rule.sharing !== undefined && sharing.includes(rule.sharing);
  });
}

import { createAccessControl } from "better-auth/plugins/access";

// Organization administration only. Entity access is enforced by database repositories.
export const ac = createAccessControl({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
} as const);

export const owner = ac.newRole({
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

export const admin = ac.newRole({
  organization: ["update"],
  member: ["delete"],
  invitation: [],
});

export const member = ac.newRole({
  organization: [],
  member: [],
  invitation: [],
});

export const roles = { owner, admin, member };
export type OrganizationRole = keyof typeof roles;

import type { CrmWrite } from "@substrate/contracts/crm/input";

export type AccessLevel = Extract<CrmWrite, { action: "share" }>["level"];

/** Direct access levels, from least to most. */
export const accessLevelLabels: Record<AccessLevel, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
  owner: "Can manage access",
};

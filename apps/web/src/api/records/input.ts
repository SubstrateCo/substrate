import type { RecordArchiveFilter } from "@substrate/contracts/crm/input";

export type RecordListInput = {
  organizationId: string;
  search?: string;
  archived?: RecordArchiveFilter;
  afterEntityId?: string;
};

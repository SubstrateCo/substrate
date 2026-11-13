export type RecordListInput = {
  organizationId: string;
  search?: string;
  archived?: "active" | "archived" | "all";
  afterEntityId?: string;
};

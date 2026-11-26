export interface QueryScope {
  userId: string;
  organizationId: string;
}
type QueryFilters = Readonly<
  Record<string, string | number | boolean | null | undefined | readonly string[]>
>;

export const queryKeys = {
  account: (userId: string) => ["account", userId] as const,
  workspace: ({ userId, organizationId }: QueryScope) =>
    ["account", userId, "workspace", organizationId] as const,
  domain: (scope: QueryScope, domain: string) => [...queryKeys.workspace(scope), domain] as const,
  list: (scope: QueryScope, domain: string, filters: QueryFilters = {}) =>
    [...queryKeys.domain(scope, domain), "list", filters] as const,
  detail: (scope: QueryScope, domain: string, id: string) =>
    [...queryKeys.domain(scope, domain), "detail", id] as const,
};

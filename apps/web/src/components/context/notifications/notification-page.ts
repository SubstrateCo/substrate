import { notificationPageOptions } from "@/queries/context/notifications";

/** The feed measures its page size first, so the first page is fetched only once. */
export function notificationListQuery(
  organizationId: string,
  filter: "all" | "unread",
  after: string | undefined,
  pageSize: number | undefined,
) {
  return {
    ...notificationPageOptions(organizationId, filter, after, pageSize ?? 1),
    enabled: pageSize !== undefined,
  };
}

/** Rows are 4rem tall. Keep 2px for the list border. */
export function fittingPageSize({
  height,
  paddingTop,
  paddingBottom,
  fontSize,
}: {
  height: number;
  paddingTop: number;
  paddingBottom: number;
  fontSize: number;
}) {
  const available = height - paddingTop - paddingBottom - 2;
  return Math.max(1, Math.min(20, Math.floor(available / (fontSize * 4))));
}

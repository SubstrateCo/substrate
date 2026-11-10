import { fittingPageSize, notificationListQuery } from "./notification-page";
import { expect, test } from "bun:test";

test("the notification page waits for a measured page size before it fetches", () => {
  expect(notificationListQuery("org", "all", undefined, undefined).enabled).toBe(false);
  const measured = notificationListQuery("org", "all", undefined, 7);
  expect(measured.enabled).toBe(true);
  expect(measured.queryKey).toContain(7);
});

test("the page size fits whole rows in the feed and stays between 1 and 20", () => {
  const feed = { height: 400, paddingTop: 24, paddingBottom: 24, fontSize: 16 };
  expect(fittingPageSize(feed)).toBe(5);
  expect(fittingPageSize({ ...feed, height: 40 })).toBe(1);
  expect(fittingPageSize({ ...feed, height: 4000 })).toBe(20);
});

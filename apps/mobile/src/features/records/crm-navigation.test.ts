import { mobileRouteFromUrl } from "../../lib/record-links";
import { crmSection, interactionView } from "./crm-navigation";
import { expect, test } from "bun:test";

test.each([
  { section: "person", kind: "contact" },
  { section: "account", kind: "account" },
])("an interaction $section profile opens the correct CRM record", ({ section, kind }) => {
  const route = mobileRouteFromUrl(
    `/interactions?workspaceId=org-one&section=${section}&profileId=customer-one`,
  );
  expect(route).not.toBeNull();
  const params = new URL(route!, "https://mobile.invalid").searchParams;
  expect(params.get("workspaceId")).toBe("org-one");
  expect(params.get("tab")).toBe("crm");
  expect(JSON.parse(params.get("record")!)).toEqual({ kind, id: "customer-one" });
});

test("incoming CRM and interaction directory URLs select their real mobile view", () => {
  for (const [path, section, view] of [
    ["/crm?workspaceId=org&section=reports", "reports", "timeline"],
    ["/interactions?workspaceId=org&section=people", "interactions", "people"],
    ["/interactions?workspaceId=org&section=activity", "interactions", "activity"],
  ] as const) {
    const route = mobileRouteFromUrl(path);
    expect(route).not.toBeNull();
    const params = new URL(route!, "https://mobile.invalid").searchParams;
    expect(crmSection(params.get("crmSection") ?? undefined)).toBe(section);
    expect(interactionView(params.get("interactionView") ?? undefined)).toBe(view);
  }
  expect(crmSection("invalid")).toBe("contacts");
  expect(interactionView("invalid")).toBe("timeline");
});

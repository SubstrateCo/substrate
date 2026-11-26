import { mobileRouteFromUrl } from "./record-links";
import { describe, expect, test } from "bun:test";

describe("incoming record links", () => {
  test("retains organization and source task location", () => {
    const route = mobileRouteFromUrl("/tasks?workspaceId=org-1&projectId=project-1&taskId=task-1");
    const url = new URL(route!, "https://mobile.invalid");
    expect(url.searchParams.get("workspaceId")).toBe("org-1");
    expect(JSON.parse(url.searchParams.get("record")!)).toEqual({
      kind: "task",
      id: "task-1",
      projectId: "project-1",
    });
  });

  test("keeps a linked message anchor for history resolution", () => {
    const route = mobileRouteFromUrl(
      "substrate-mobile://messages?workspaceId=o&conversationId=c&messageId=m",
    );
    const url = new URL(route!, "https://mobile.invalid");
    expect(url.searchParams.get("conversationId")).toBe("c");
    expect(url.searchParams.get("messageId")).toBe("m");
  });

  test("rejects untrusted origins, missing scope, and unsupported apps", () => {
    expect(mobileRouteFromUrl("https://other.example/tasks?workspaceId=o")).toBeNull();
    expect(mobileRouteFromUrl("/contacts?recordId=c")).toBeNull();
    expect(mobileRouteFromUrl("/agents?workspaceId=o")).toBeNull();
    expect(mobileRouteFromUrl("//other.example/tasks?workspaceId=o")).toBeNull();
  });
});

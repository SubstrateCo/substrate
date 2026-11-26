import { authDestination } from "./navigation";
import { expect, test } from "bun:test";

test("login retains an organization-aware message destination", () => {
  const destination = authDestination(
    "/?workspaceId=org-1&conversationId=channel-1&messageId=reply-1",
  );
  const url = new URL(destination!, "https://mobile.invalid");
  expect(url.searchParams.get("workspaceId")).toBe("org-1");
  expect(url.searchParams.get("conversationId")).toBe("channel-1");
  expect(url.searchParams.get("messageId")).toBe("reply-1");
});

test("login cannot resume an unscoped private record or an external redirect", () => {
  expect(authDestination("/?conversationId=channel-1")).toBeUndefined();
  expect(authDestination("/?record=not-json")).toBeUndefined();
  expect(authDestination("//other.example/?workspaceId=org-1")).toBeUndefined();
  expect(authDestination("/?workspaceId=org-1&tab=desktop")).toBeUndefined();
});

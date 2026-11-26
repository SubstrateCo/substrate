import {
  appEnabled,
  appIds,
  appScope,
  requiredAppsForEntityType,
  updateApps,
  updateUserApp,
} from "./index";
import { expect, test } from "bun:test";

test("core apps cannot be switched off and optional apps must be enabled explicitly", () => {
  expect(appEnabled([], "messages")).toBe(true);
  expect(appEnabled([], "agents")).toBe(true);
  expect(appEnabled([], "tasks")).toBe(false);
  expect(appEnabled(["crm"], "crm")).toBe(true);
});

test("entity requirements distinguish app records from shared primitives", () => {
  for (const type of ["task", "project"])
    expect(requiredAppsForEntityType(type)).toEqual(["tasks"]);
  for (const type of ["account", "deal"]) expect(requiredAppsForEntityType(type)).toEqual(["crm"]);
  for (const type of ["contact", "contact_interaction", "actor", "unknown", "toString"])
    expect(requiredAppsForEntityType(type)).toEqual([]);
});

test("settings reject missing core apps, duplicate apps, and unknown apps", () => {
  for (const enabledApps of [
    ["tasks"],
    ["messages", "agents", "crm", "crm"],
    ["messages", "agents", "email"],
    ["messages", "agents", "inbox"],
  ])
    expect(updateApps.safeParse({ organizationId: "org", enabledApps }).success).toBe(false);
  expect(
    updateApps.parse({ organizationId: "org", enabledApps: ["messages", "agents"] }).enabledApps,
  ).toEqual(["messages", "agents"]);
});

test("personal apps are separate from workspace settings", () => {
  expect(appScope("inbox")).toBe("user");
  for (const app of appIds.filter((id) => id !== "inbox"))
    expect(appScope(app)).toBe("organization");
  expect(
    updateUserApp.safeParse({ organizationId: "org", appId: "inbox", enabled: true }).success,
  ).toBe(true);
  for (const input of [
    { organizationId: "org", appId: "tasks", enabled: true },
    { organizationId: "org", appId: "inbox", enabled: true, userId: "other" },
  ])
    expect(updateUserApp.safeParse(input).success).toBe(false);
});

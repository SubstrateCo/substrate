import { appEnabled, requiredAppsForEntityType, updateApps } from "./index";
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
  ])
    expect(updateApps.safeParse({ organizationId: "org", enabledApps }).success).toBe(false);
  expect(
    updateApps.parse({ organizationId: "org", enabledApps: ["messages", "agents"] }).enabledApps,
  ).toEqual(["messages", "agents"]);
});

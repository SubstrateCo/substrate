import type { DesktopUpdateStatus } from "@substrate/contracts/desktop/updates-ipc";

import { updateRailLabel } from "./update-rail-label";
import { expect, test } from "bun:test";

const status = (state: DesktopUpdateStatus["state"]): DesktopUpdateStatus => ({
  appVersion: "0.1.0",
  install: "automatic",
  state,
});

test("keeps the update discoverable from availability through restart", () => {
  expect(updateRailLabel(status({ status: "available", version: "0.2.0" }))).toBe(
    "Update available",
  );
  expect(updateRailLabel(status({ status: "downloading", version: "0.2.0", percent: 40 }))).toBe(
    "Downloading update",
  );
  expect(updateRailLabel(status({ status: "ready", version: "0.2.0" }))).toBe("Update ready");
});

test("does not claim an update exists for quiet, failed, or unsupported checks", () => {
  expect(updateRailLabel(status({ status: "installing", version: "0.2.0" }))).toBeUndefined();
  for (const state of ["idle", "checking", "current", "error"] as const)
    expect(updateRailLabel(status({ status: state }))).toBeUndefined();
  expect(
    updateRailLabel({
      ...status({ status: "available", version: "0.2.0" }),
      install: "unavailable",
    }),
  ).toBeUndefined();
});

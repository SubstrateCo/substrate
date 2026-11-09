import { homeDeviceLabel } from "./triggers";
import { expect, test } from "bun:test";

test.each([
  [null, "No desktop yet"],
  [{ name: "Laptop", online: true, current: true }, "Laptop (this device)"],
  [{ name: "Laptop", online: true, current: false }, "Laptop (online)"],
  [{ name: "Laptop", online: false, current: false }, "Laptop (offline)"],
])("describes the home device %p", (device, label) => {
  expect(homeDeviceLabel(device)).toBe(label);
});

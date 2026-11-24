import { desktopIdentity } from "@substrate/contracts/desktop/identity";

import config from "../package.json" with { type: "json" };
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

test("the installer and packaged runtime use the same production identity", () => {
  const identity = desktopIdentity(true);
  expect(config.build.appId).toBe(identity.appId);
  expect(config.build.productName).toBe(identity.name);
  expect(config.build.protocols.flatMap((protocol) => protocol.schemes)).toEqual([identity.scheme]);
});

test("the Windows app icon includes taskbar and tray resolutions", () => {
  const icon = readFileSync(new URL(`../${config.build.win.icon}`, import.meta.url));
  expect(icon.readUInt16LE(2)).toBe(1);
  const sizes = Array.from({ length: icon.readUInt16LE(4) }, (_, index) => {
    const entry = 6 + index * 16;
    const width = icon.readUInt8(entry) || 256;
    const height = icon.readUInt8(entry + 1) || 256;
    expect(height).toBe(width);
    const offset = icon.readUInt32LE(entry + 12);
    const length = icon.readUInt32LE(entry + 8);
    expect(offset + length).toBeLessThanOrEqual(icon.length);
    return width;
  });
  expect(sizes).toEqual(expect.arrayContaining([16, 20, 24, 32, 40, 48, 64, 128, 256]));
});

test("the macOS bundle icon includes Dock and Finder resolutions", () => {
  const icon = readFileSync(new URL(`../${config.build.mac.icon}`, import.meta.url));
  expect(icon.toString("ascii", 0, 4)).toBe("icns");
  expect(icon.readUInt32BE(4)).toBe(icon.length);
  const types: string[] = [];
  let offset = 8;
  while (offset < icon.length) {
    types.push(icon.toString("ascii", offset, offset + 4));
    const length = icon.readUInt32BE(offset + 4);
    expect(length).toBeGreaterThan(8);
    offset += length;
  }
  expect(offset).toBe(icon.length);
  expect(types).toEqual(["icp4", "icp5", "icp6", "ic07", "ic08", "ic09"]);
});

test("the macOS menu-bar template has standard and Retina assets", () => {
  for (const [name, size] of [
    ["trayTemplate.png", 22],
    ["trayTemplate@2x.png", 44],
  ] as const) {
    const icon = readFileSync(new URL(`../assets/${name}`, import.meta.url));
    expect(icon.toString("ascii", 1, 4)).toBe("PNG");
    expect(icon.readUInt32BE(16)).toBe(size);
    expect(icon.readUInt32BE(20)).toBe(size);
    expect(icon.readUInt8(25)).toBe(6);
  }
});

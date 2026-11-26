import { desktopIdentity } from "@substrate/contracts/desktop/identity";

import config from "../package.json" with { type: "json" };
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

function expectMacIconPadding(png: Buffer) {
  const size = png.readUInt32BE(16);
  expect(png.readUInt32BE(20)).toBe(size);
  expect(png.readUInt8(24)).toBe(8);
  expect(png.readUInt8(25)).toBe(6);
  const chunks: Buffer[] = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    if (png.toString("ascii", offset + 4, offset + 8) === "IDAT")
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = size * 4;
  const pixels = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    const filter = raw[y * (stride + 1)]!;
    expect(filter).toBeLessThanOrEqual(4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? pixels[index - 4]! : 0;
      const up = y > 0 ? pixels[index - stride]! : 0;
      const corner = x >= 4 && y > 0 ? pixels[index - stride - 4]! : 0;
      const prediction = left + up - corner;
      const distances = [left, up, corner].map((value) => Math.abs(prediction - value));
      const paeth = [left, up, corner][distances.indexOf(Math.min(...distances))]!;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter]!;
      pixels[index] = (raw[y * (stride + 1) + 1 + x]! + predictor) & 255;
    }
  }
  const padding = Math.round(size * 0.1);
  let borderAlpha = 0;
  let visible = false;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const alpha = pixels[(y * size + x) * 4 + 3]!;
      const horizontalBorder = x < padding || x >= size - padding;
      const verticalBorder = y < padding || y >= size - padding;
      if (horizontalBorder || verticalBorder) borderAlpha = Math.max(borderAlpha, alpha);
      visible ||= alpha > 0;
    }
  }
  expect(borderAlpha).toBe(0);
  expect(visible).toBe(true);
}

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

test("the macOS Dock and bundle icons have transparent outer padding", () => {
  const dock = readFileSync(new URL("../assets/icon-mac.png", import.meta.url));
  expectMacIconPadding(dock);
  const bundle = readFileSync(new URL(`../${config.build.mac.icon}`, import.meta.url));
  let largest: Buffer | undefined;
  for (let offset = 8; offset < bundle.length; ) {
    const length = bundle.readUInt32BE(offset + 4);
    largest = bundle.subarray(offset + 8, offset + length);
    expectMacIconPadding(largest);
    offset += length;
  }
  expect(dock.equals(largest!)).toBe(true);
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

import { desktopIdentity } from "./identity.ts";
import { expect, test } from "bun:test";

test("production keeps its installed identity and development uses a separate identity", () => {
  expect(desktopIdentity(true)).toEqual({
    name: "Substrate",
    directory: "Substrate",
    scheme: "substrate",
    appId: "com.substrate.desktop",
  });
  expect(desktopIdentity(false)).toEqual({
    name: "Substrate Dev",
    directory: "Substrate-dev",
    scheme: "substrate-dev",
    appId: "com.substrate.desktop.dev",
  });
});

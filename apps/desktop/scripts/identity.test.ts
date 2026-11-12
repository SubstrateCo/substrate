import { desktopIdentity } from "@substrate/contracts/desktop/identity";

import config from "../package.json" with { type: "json" };
import { expect, test } from "bun:test";

test("the installer and packaged runtime use the same production identity", () => {
  const identity = desktopIdentity(true);
  expect(config.build.appId).toBe(identity.appId);
  expect(config.build.productName).toBe(identity.name);
  expect(config.build.protocols.flatMap((protocol) => protocol.schemes)).toEqual([identity.scheme]);
});

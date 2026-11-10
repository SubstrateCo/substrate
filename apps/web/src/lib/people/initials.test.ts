import { initials } from "./initials";
import { expect, test } from "bun:test";

test("initials use two words when present and fall back for one word or no name", () => {
  expect(initials("ada  lovelace byron")).toBe("AL");
  expect(initials(" Acme ")).toBe("AC");
  expect(initials("   ")).toBe("?");
});

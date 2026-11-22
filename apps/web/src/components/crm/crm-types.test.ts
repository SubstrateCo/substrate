import { dealAmount } from "./crm-types";
import { expect, test } from "bun:test";

test("deal amounts display as currency instead of stored decimal strings", () => {
  expect(dealAmount("12345.0000", "USD")).toBe("$12,345.00");
  expect(dealAmount("12345.6789", "USD")).toBe("$12,345.68");
});

test("deal amounts use the currency's decimal precision", () => {
  expect(dealAmount("12345.0000", "JPY")).toBe("¥12,345");
  expect(dealAmount("12.3456", "KWD")).toBe("KWD\u00a012.346");
});

test("unset amounts and amounts without a currency do not assume dollars", () => {
  expect(dealAmount(null, "USD")).toBe("Amount not set");
  expect(dealAmount("12345.0000", null)).toBe("12,345");
});

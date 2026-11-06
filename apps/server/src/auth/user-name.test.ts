import { describe, expect, test } from "bun:test";
import { normalizeUserName } from "./user-name";

describe("user name policy", () => {
  test("rejects non-string names from native user updates", () => {
    for (const name of [null, 42, {}, [], true]) {
      expect(() => normalizeUserName({ name })).toThrow("Name must be a string.");
    }
  });

  test("rejects empty and whitespace-only names before persistence", () => {
    for (const name of ["", "   ", "\t\n\r", "\u00a0"]) {
      expect(() => normalizeUserName({ name })).toThrow("Name must not be blank.");
    }
  });

  test("trims valid names without changing other fields", () => {
    expect(normalizeUserName({ name: "  Alice Smith\t", email: "alice@example.com" })).toEqual({
      name: "Alice Smith",
      email: "alice@example.com",
    });
  });

  test("allows updates that omit the name without adding or changing fields", () => {
    expect(normalizeUserName({ emailVerified: true })).toEqual({ emailVerified: true });
    expect(normalizeUserName({ name: undefined, image: null })).toEqual({
      name: undefined,
      image: null,
    });
  });
});

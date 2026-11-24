import { newId } from "./ids";
import { expect, test } from "bun:test";
import { z } from "zod";

test("an ID is a version 7 UUID with the generation millisecond as its prefix", () => {
  const at = Date.UTC(2026, 10, 24, 12, 30, 45, 123);
  const id = newId(at + 10_000_000);
  expect(z.uuid({ version: "v7" }).safeParse(id).success).toBe(true);
  expect(Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16)).toBe(at + 10_000_000);
});

test("IDs sort in creation order within a millisecond and when the clock steps back", () => {
  const start = Date.now() + 20_000_000;
  const times = [
    ...Array.from({ length: 5000 }, () => start),
    start - 5,
    start + 1,
    ...Array.from({ length: 5000 }, () => start + 1),
  ];
  const ids = times.map((now) => newId(now));
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.toSorted()).toEqual(ids);
});

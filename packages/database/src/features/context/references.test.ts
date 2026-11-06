import { messageReferences } from "./references";
import { expect, test } from "bun:test";

const id = "12345678-1234-1234-1234-123456789abc";
test("structured references deduplicate by kind and identity, without interpreting plain names", () => {
  expect(
    messageReferences(`Hello @Alice **work** @[task:${id}] @[task:${id}] @[person:${id}]`),
  ).toEqual([
    { kind: "task", id },
    { kind: "person", id },
  ]);
});
test("malformed and unsupported references are rejected", () => {
  for (const body of [
    "@[task:no]",
    `@[file:${id}]`,
    "@[task:------------------------------------]",
  ])
    expect(() => messageReferences(body)).toThrow("Invalid reference");
});

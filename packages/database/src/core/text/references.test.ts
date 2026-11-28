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

test("channel and thread references retain distinct structured identities", () => {
  expect(
    messageReferences(`See #general @[channel:${id}] @[thread:${id}] @[channel:${id}]`),
  ).toEqual([
    { kind: "channel", id },
    { kind: "thread", id },
  ]);
  expect(() => messageReferences(`@[message:${id}]`)).toThrow("Invalid reference");
});

test("a rejected reference names its token and the kinds a message can mention", () => {
  expect(() => messageReferences(`Updated @[deal:${id}] today`)).toThrow(
    `Invalid reference @[deal:${id}]. A message can mention only a task, project, person, agent, channel or thread`,
  );
});

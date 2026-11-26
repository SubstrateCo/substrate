import { canonicalJson, proposalAction, proposalActionHash } from "./proposals.ts";
import { expect, test } from "bun:test";

const conversationId = crypto.randomUUID();

test("canonical JSON sorts keys at every level and drops undefined fields", () => {
  expect(
    canonicalJson({ b: 1, a: { d: [3, { z: true, y: null }], c: "x" }, skip: undefined }),
  ).toBe('{"a":{"c":"x","d":[3,{"y":null,"z":true}]},"b":1}');
  // Arrays keep their order; sorting would change meaning.
  expect(canonicalJson([2, 1])).toBe("[2,1]");
  // UTF-16 code unit order: uppercase sorts before lowercase.
  expect(canonicalJson({ b: 1, B: 2, a: 3 })).toBe('{"B":2,"a":3,"b":1}');
  expect(() => canonicalJson({ n: Number.NaN })).toThrow(TypeError);
});

test("the action hash ignores key order and changes with the tool or any input field", async () => {
  const first = await proposalActionHash({
    tool: "reply",
    input: { to: { conversationId }, body: "Hello" },
  });
  const reordered = await proposalActionHash(
    proposalAction.parse({ input: { body: "Hello", to: { conversationId } }, tool: "reply" }),
  );
  const changed = await proposalActionHash({
    tool: "reply",
    input: { to: { conversationId }, body: "Hello!" },
  });
  const otherTool = await proposalActionHash({
    tool: "create_task",
    input: { to: { conversationId }, body: "Hello" },
  });
  expect(first).toMatch(/^[0-9a-f]{64}$/);
  expect(reordered).toBe(first);
  expect(changed).not.toBe(first);
  expect(otherTool).not.toBe(first);
});

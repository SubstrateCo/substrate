import { excerptText } from "./message-excerpt";
import { expect, test } from "bun:test";

const task = "11111111-1111-4111-8111-111111111111";
const person = "22222222-2222-4222-8222-222222222222";

test("excerpts name readable references and use neutral words for the rest", () => {
  const labels = new Map([[`task:${task}`, "Ship the beta"]]);
  expect(
    excerptText(`@[person:${person}] could you review @[TASK:${task.toUpperCase()}]?`, labels),
  ).toBe("someone could you review Ship the beta?");
});

test("excerpts drop light Markdown, join lines, and stay within the length", () => {
  expect(
    excerptText("# Plan\n- **Ship** `it`\n> [docs](https://x.test)", new Map<string, string>()),
  ).toBe("Plan Ship it docs");
  expect(excerptText("word ".repeat(10), new Map<string, string>(), 12)).toBe("word word…");
});

import type { DatabaseExecutor } from "../client";
import { RepositoryEffects, effectExecutor, effectsFor } from "./effects";
import { expect, test } from "bun:test";

test("effects on an executor outside a committed write are rejected, not dropped", () => {
  // SAFETY: effectsFor only uses the executor as a key; no query runs.
  const db = {} as DatabaseExecutor;
  expect(() => effectsFor(db)).toThrow();
  const effects = new RepositoryEffects();
  expect(effectsFor(effectExecutor(db, effects))).toBe(effects);
});

test("merging committed savepoint effects deduplicates hints and mail", () => {
  const effects = new RepositoryEffects();
  const child = new RepositoryEffects();
  const hint = { audience: ["organization", "org"] as const, domain: "tasks" as const };
  effects.hint(hint);
  child.hint(hint);
  child.mail("sharing");
  effects.merge(child);
  expect(effects.committed("saved")).toEqual({ result: "saved", hints: [hint], mail: ["sharing"] });
});

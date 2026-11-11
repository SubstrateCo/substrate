import { RepositoryEffects } from "./effects";
import { expect, test } from "bun:test";

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

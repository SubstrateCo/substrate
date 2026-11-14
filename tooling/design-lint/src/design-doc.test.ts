import { DESIGN_DOC } from "./design-doc.ts";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");
const webSource = join(root, "apps/web/src");
const design = readFileSync(join(root, DESIGN_DOC), "utf8").replaceAll("\r\n", "\n");

/** The rule sources, whose messages point to the design doc and to web modules. */
const sources = readdirSync(import.meta.dirname, { recursive: true, encoding: "utf8" })
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => readFileSync(join(import.meta.dirname, file), "utf8"));
const matches = (pattern: RegExp) => [
  ...new Set(sources.flatMap((source) => [...source.matchAll(pattern)].map((match) => match[1]!))),
];

/** The text of "## <number>. <title>", up to the next numbered section. */
function section(number: string) {
  const start = design.search(new RegExp(`^## ${number}\\. `, "m"));
  if (start < 0) return undefined;
  const end = design.slice(start + 1).search(/^## /m);
  return end < 0 ? design.slice(start) : design.slice(start, start + 1 + end);
}

void test('every see("§N name") names a section, subsection or bold label in DESIGN.md', () => {
  const references = matches(/see\("([^"]+)"\)/g);
  assert.ok(references.length > 0);
  for (const reference of references) {
    const [, number, rest] = /^(\d+) (.+)$/.exec(reference) ?? [];
    const text = number ? section(number) : undefined;
    assert.ok(text, `${reference}: no section ${number}`);
    const title = /^## \d+\. (.+)$/m.exec(text)![1];
    for (const part of rest!.split(", ")) {
      const [, name, label] = /^(.+?)(?: \((.+)\))?$/.exec(part)!;
      const headed = name === title || text.split("\n").includes(`### ${name}`);
      assert.ok(headed, `${reference}: no heading "${name}" in section ${number}`);
      if (label) assert.ok(text.includes(`**${label}**`), `${reference}: no label "${label}"`);
    }
  }
});

void test("every @/ path in a message resolves under apps/web/src", () => {
  const paths = matches(/"@\/([\w./-]+)"/g);
  assert.ok(paths.length > 0);
  for (const path of paths) {
    const base = join(webSource, path);
    const found = ["", ".ts", ".tsx"].some((extension) => existsSync(base + extension));
    assert.ok(found, `@/${path} does not exist`);
  }
});

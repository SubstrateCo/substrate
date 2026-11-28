import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");
const source = join(root, "apps/web/src");
const ui = join(source, "components/ui");

const INDIRECT: Record<string, string> = {};

const files = readdirSync(source, { recursive: true, encoding: "utf8" })
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
  .map((file) => ({ path: join(source, file), text: readFileSync(join(source, file), "utf8") }));
const name = (path: string) => relative(root, path).replaceAll("\\", "/");

function block(text: string, start: number) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"' || char === "'" || char === "`") {
      for (i++; i < text.length && text[i] !== char; i++) if (text[i] === "\\") i++;
    } else if (char === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i);
    } else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return text.slice(start + 1, i);
  }
  throw new Error("Unbalanced braces");
}

function entries(body: string) {
  const found: { key: string; value: string }[] = [];
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body[i]!;
    if (char === '"' || char === "'" || char === "`") {
      const end = body.indexOf(char, i + 1);
      if (depth === 0) {
        const key = /^\s*:/.exec(body.slice(end + 1));
        if (key)
          found.push({
            key: body.slice(i + 1, end),
            value: valueAt(body, end + 1 + key[0].length),
          });
      }
      i = end;
    } else if (char === "/" && body[i + 1] === "/") i = body.indexOf("\n", i);
    else if (char === "{" || char === "(" || char === "[") depth++;
    else if (char === "}" || char === ")" || char === "]") depth--;
    else if (depth === 0 && /[A-Za-z_$]/.test(char) && /(?:^|[\s,{])$/.test(body.slice(0, i))) {
      const match = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(i));
      if (match) {
        found.push({ key: match[1]!, value: valueAt(body, i + match[0].length) });
        i += match[0].length - 1;
      }
    }
  }
  return found;
}

function valueAt(body: string, index: number) {
  const brace = body.slice(index).search(/\S/);
  return body[index + brace] === "{" ? block(body, index + brace) : "";
}

type Variant = { file: string; group: string; value: string };

function variants(): Variant[] {
  const result: Variant[] = [];
  for (const file of files.filter(({ path }) => path.startsWith(ui))) {
    for (const match of file.text.matchAll(/\bvariants:\s*\{/g)) {
      const body = block(file.text, match.index + match[0].length - 1);
      const defaults =
        /defaultVariants:\s*\{([^}]*)\}/.exec(file.text.slice(match.index))?.[1] ?? "";
      for (const { key: group, value } of entries(body)) {
        const values = entries(value).map(({ key }) => key);
        if (values.every((key) => key === "true" || key === "false")) continue;
        for (const key of values) {
          const isDefault =
            key === "default" || new RegExp(`\\b${group}\\s*:\\s*["']${key}["']`).test(defaults);
          if (!isDefault) result.push({ file: name(file.path), group, value: key });
        }
      }
    }
  }
  return result;
}

function used({ group, value, file }: Variant) {
  const quoted = `["'\`]${value.replace(/[-]/g, "\\-")}["'\`]`;
  const pattern = new RegExp(
    `\\b${group}\\s*[=:]\\s*(?:\\{[^\\n]*)?${quoted}|\\b${group}\\s*[=:][^\\n;]*\\?[^\\n;]*${quoted}`,
  );
  return files.some(({ path, text }) => name(path) !== file && pattern.test(text));
}

void test("every variant of a components/ui primitive has a use in the renderer", () => {
  const all = variants();
  assert.ok(all.length > 20, "the scan finds the primitives' variants");
  const unused = [
    ...new Set(
      all
        .filter((variant) => !INDIRECT[`${variant.file} ${variant.group}=${variant.value}`])
        .filter((variant) => !used(variant))
        .map(({ file, group, value }) => `${file} ${group}=${value}`),
    ),
  ];
  assert.deepEqual(
    unused,
    [],
    "Delete a variant when its last use goes (apps/web/AGENTS.md). If a use passes the value through a variable, add it to INDIRECT with its source.",
  );
});

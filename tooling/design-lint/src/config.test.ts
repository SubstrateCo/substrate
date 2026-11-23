import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { test } from "node:test";

const root = join(import.meta.dirname, "../../..");
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("oxlint/package.json")), "bin/oxlint");

void test("renderer design configuration protects shared components and raw table imports", () => {
  const directory = mkdtempSync(join(root, "apps/web/src/design-lint-test-"));
  try {
    const file = join(directory, "view.tsx");
    writeFileSync(
      file,
      `
import { PersonAvatar } from "@/components/people/person-avatar";
import { PageSheetBody } from "@/components/layout/page-sheet";
import { Table } from "@/components/ui/table";
export const View = () => (
  <PageSheetBody className="px-2">
    <PersonAvatar name="Ada" className="size-8" />
    <Table />
  </PageSheetBody>
);
`,
    );
    const invalid = lint(file);
    assert.equal(
      invalid.filter((code) => code === "shadcn(no-restyle)").length,
      2,
      "Both shared components must be recognized outside components/ui.",
    );
    assert.ok(invalid.includes("eslint(no-restricted-imports)"), "Use AppTable instead.");

    writeFileSync(
      file,
      `
import { PersonAvatar } from "@/components/people/person-avatar";
import { PageSheetBody } from "@/components/layout/page-sheet";
export const View = () => (
  <PageSheetBody className="min-w-0">
    <PersonAvatar name="Ada" size="xs" className="ml-2" />
  </PageSheetBody>
);
`,
    );
    assert.deepEqual(lint(file), [], "Shared sizes and caller placement remain allowed.");
    assert.deepEqual(
      lint(join(root, "apps/web/src/components/table/app-table.tsx")),
      [],
      "AppTable can still compose raw table primitives.",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test("renderer design configuration keeps primitive libraries behind components/ui", () => {
  const directory = mkdtempSync(join(root, "apps/web/src/design-lint-test-"));
  try {
    const file = join(directory, "view.tsx");
    writeFileSync(
      file,
      `
import { Command } from "cmdk";
import { Popover } from "radix-ui";
import { Toaster } from "sonner";
export const parts = [Command, Popover, Toaster];
`,
    );
    assert.equal(
      lint(file).filter((code) => code === "eslint(no-restricted-imports)").length,
      3,
      "Libraries that a primitive wraps must come through components/ui.",
    );

    writeFileSync(
      file,
      `
import { Slot } from "radix-ui";
import type { Layout } from "react-resizable-panels";
import { toast } from "sonner";
export const parts = [Slot, toast];
export const saved: Layout = {};
`,
    );
    assert.deepEqual(lint(file), [], "Slot, toast, and type-only panel imports remain allowed.");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function lint(file: string): string[] {
  const result = spawnSync(process.execPath, [cli, "--format", "json", file], {
    cwd: root,
    encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  const output = JSON.parse(result.stdout) as { diagnostics: { code: string }[] };
  return output.diagnostics.map((diagnostic) => diagnostic.code);
}

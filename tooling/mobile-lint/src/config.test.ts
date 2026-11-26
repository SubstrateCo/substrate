import { mobileConfig } from "./config.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve("oxlint/package.json")), "bin/oxlint");

function lint(filename: string, input: string): string[] {
  const temporary = join(tmpdir(), "opencode");
  mkdirSync(temporary, { recursive: true });
  const fixture = mkdtempSync(join(temporary, "mobile-lint-"));
  try {
    const file = join(fixture, filename);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, input);
    const config = join(fixture, ".oxlintrc.json");
    writeFileSync(
      config,
      JSON.stringify({
        ...mobileConfig,
        jsPlugins: [
          {
            name: "mobile",
            specifier: join(import.meta.dirname, "index.ts"),
          },
        ],
      }),
    );
    const result = spawnSync(process.execPath, [cli, "-c", config, "--format", "json", file], {
      cwd: fixture,
      encoding: "utf8",
    });
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    assert.ok(result.stdout, result.stderr);
    const output = JSON.parse(result.stdout) as { diagnostics: { code?: string }[] };
    return output.diagnostics.flatMap((item) =>
      item.code?.startsWith("mobile(") ? [item.code] : [],
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

void test("mobile config enables native rules without restricting desktop or Expo tooling", () => {
  const source = `
    import { Pressable } from "react-native";
    import { Button } from "@/components/ui/button";
    import { db } from "@substrate/database";
    export const Bad = () => <Pressable style={{ backgroundColor: "#fff" }}><Button size="icon" /></Pressable>;
  `;
  assert.deepEqual(lint("apps/mobile/src/components/tasks/actions.tsx", source).sort(), [
    "mobile(icon-button-name)",
    "mobile(native-boundaries)",
    "mobile(no-raw-colors)",
    "mobile(use-primitives)",
  ]);
  assert.deepEqual(lint("apps/mobile/metro.config.ts", source), []);
  assert.deepEqual(lint("apps/web/src/components/tasks/actions.tsx", source), []);
  assert.deepEqual(
    lint("apps/mobile/src/api/client.test.ts", 'import { test } from "bun:test";'),
    [],
  );
});

void test("wrappers can compose touch targets but still cannot bypass tokens or native boundaries", () => {
  const source = `
    import { Pressable } from "react-native";
    import { db } from "@substrate/database";
    export const Surface = () => <Pressable style={{ backgroundColor: "#fff" }} />;
  `;
  for (const folder of ["ui", "gestures", "editor"]) {
    assert.deepEqual(lint(`apps/mobile/src/components/${folder}/surface.tsx`, source).sort(), [
      "mobile(native-boundaries)",
      "mobile(no-raw-colors)",
    ]);
  }
});

void test("only theme adapters can define native color literals", () => {
  const source = 'export const theme = { backgroundColor: "#fff" };';
  assert.deepEqual(lint("apps/mobile/src/lib/theme.ts", source), []);
  assert.deepEqual(lint("apps/mobile/src/lib/theme/native.ts", source), []);
  assert.deepEqual(lint("apps/mobile/src/theme/navigation.ts", source), []);
  assert.deepEqual(lint("apps/mobile/src/lib/tokens/generated/native.ts", source), []);
  assert.deepEqual(lint("apps/mobile/src/lib/features/theme.ts", source), [
    "mobile(no-raw-colors)",
  ]);
  assert.deepEqual(
    lint("apps/mobile/src/lib/theme.ts", 'import { db } from "@substrate/database";'),
    ["mobile(native-boundaries)"],
  );
});

void test("web editors may use DOM APIs but still enforce mobile runtime and token boundaries", () => {
  const source = `
    import { EditorContent } from "@tiptap/react";
    import { createRoot } from "react-dom/client";
    import { db } from "@substrate/database";
    import { BrowserWindow } from "electron";
    const element = document.createElement("div");
    export const Editor = () => <div className="text-red-500" />;
  `;
  assert.deepEqual(lint("apps/mobile/src/components/editor/editor.web.tsx", source).sort(), [
    "mobile(native-boundaries)",
    "mobile(native-boundaries)",
    "mobile(no-raw-colors)",
  ]);
});

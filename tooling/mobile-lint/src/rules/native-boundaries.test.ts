import { ruleTester } from "../test-support.ts";
import { nativeBoundaries } from "./native-boundaries.ts";

const browserImports = [
  'import { createRoot } from "react-dom/client";',
  'import { View } from "react-native-web";',
  'import { EditorContent } from "@tiptap/react";',
  'import { Editor } from "@tiptap/core";',
  'const editor = import("@tiptap/starter-kit");',
];
const browserJsx = ["<div />;", "<input value='x' />;"];
const browserSyntax = [
  "document.createElement('div');",
  "window.location.href;",
  "localStorage.getItem('session');",
  "globalThis.document;",
  'globalThis["window"];',
];

ruleTester.run("native-boundaries", nativeBoundaries, {
  valid: [
    ...["web.ts", "web.tsx", "web.js", "web.jsx"].flatMap((extension) =>
      [...browserImports, ...browserSyntax, ...(extension.endsWith("x") ? browserJsx : [])].map(
        (code) => ({
          code,
          filename: `/repo/apps/mobile/src/editor.${extension}`,
        }),
      ),
    ),
    {
      code: 'import type { AppType } from "@substrate/server";',
      filename: "/repo/apps/mobile/src/client.web.ts",
    },
    'import { View, Text } from "react-native"; <View><Text>Hello</Text></View>;',
    'import { Platform } from "react-native"; Platform.OS === "web";',
    'import type { AppType } from "@substrate/server";',
    'import { type AppType as API } from "@substrate/server/app";',
    {
      code: 'import type { AppType } from "../../server/src/app";',
      filename: "/repo/apps/mobile/src/test.tsx",
    },
    'type API = import("@substrate/server").AppType;',
    'import { hc } from "hono/client"; import { schema } from "@substrate/contracts";',
    'import { tokens } from "@substrate/design-tokens";',
    "function read(document: { title: string }) { return document.title; }",
    "const value = { window: 'morning', color: 'red' };",
    "const require = (name: string) => name; require('electron');",
    "const globalThis = { document: 'local' }; globalThis.document;",
  ],
  invalid: [
    ...["tsx", "native.tsx", "web.tsx", "web.ts"].flatMap((extension) =>
      [
        'import { db } from "@substrate/database";',
        'import { app } from "@substrate/server";',
        'import { AppType } from "@substrate/server";',
        'import { settings } from "@substrate/desktop/settings";',
        'import { runtime } from "@substrate/web";',
        'import { window } from "electron";',
        'import { readFile } from "node:fs";',
        'import { readFile } from "fs/promises";',
        'import { Database } from "bun:sqlite";',
        'import { sql } from "drizzle-orm";',
        'import { app } from "../../web/src/app";',
        'export * from "@substrate/database";',
        'const db = import("@substrate/database");',
        'const electron = require("electron");',
        'type Bad = import("@substrate/server").Other;',
      ].map((code) => ({
        code,
        filename: `/repo/apps/mobile/src/editor.${extension}`,
        errors: [{ messageId: "import" }],
      })),
    ),
    ...["tsx", "native.tsx", "web-editor.tsx", "web.tsx.backup.tsx"].flatMap((extension) =>
      browserImports.map((code) => ({
        code,
        filename: `/repo/apps/mobile/src/editor.${extension}`,
        errors: [{ messageId: "import" }],
      })),
    ),
    ...["tsx", "native.tsx"].flatMap((extension) =>
      [...browserSyntax, ...browserJsx].map((code) => ({
        code,
        filename: `/repo/apps/mobile/src/editor.${extension}`,
        errors: [{ messageId: "dom" }],
      })),
    ),
    ...[
      'import { createRoot } from "react-dom/client";',
      'import type { BrowserWindow } from "electron";',
      'import { View } from "react-native-web";',
      'import { db } from "@substrate/database";',
      'import type { Row } from "@substrate/database/schema";',
      'import { AppType } from "@substrate/server";',
      'import type { AppType, Other } from "@substrate/server";',
      'import "@substrate/server";',
      'import * as Server from "@substrate/server";',
      'export { db } from "@substrate/database";',
      'export * from "@substrate/web";',
      'const db = import("@substrate/database");',
      'const electron = require("electron");',
      "const electron = require(`electron`);",
      'import fs from "node:fs";',
      'import fs from "fs/promises";',
      'import { sql } from "drizzle-orm";',
      'import postgres from "postgres";',
      'import { Hono } from "hono";',
      'import { Database } from "bun:sqlite";',
      'import { settings } from "@substrate/desktop/settings";',
      'import { queue } from "@substrate/client-storage";',
      'import { thing } from "../../web/src/lib/thing";',
      'import { thing } from "../../../packages/database/src/index";',
      'type Bad = import("@substrate/server").Other;',
    ].map((code) => ({
      code,
      filename: "/repo/apps/mobile/src/test.tsx",
      errors: [{ messageId: "import" }],
    })),
    ...[
      "<div />;",
      "<input value='x' />;",
      "document.createElement('div');",
      "window.substrateHarness;",
      "localStorage.getItem('session');",
      "globalThis.document;",
      'globalThis["window"];',
    ].map((code) => ({ code, errors: [{ messageId: "dom" }] })),
  ],
});

import { elementName, globalReference, stringValue, type AstNode, type Rule } from "../ast.ts";
import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";

const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const WEB_IMPORT = /^(?:react-dom|react-native-web|@tiptap\/[^/]+)(?:\/|$)/;
const DOM_GLOBALS = new Set([
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "HTMLElement",
  "HTMLInputElement",
  "Element",
  "MutationObserver",
  "ResizeObserver",
]);

function normalized(source: string, filename: string) {
  const path = source.startsWith(".") ? resolve(dirname(filename), source) : source;
  return path.replaceAll("\\", "/");
}

function serverImport(source: string) {
  return /(?:^@substrate\/server(?:\/|$)|(?:^|\/)apps\/server(?:\/|$))/.test(source);
}

function forbidden(source: string) {
  return (
    /^(?:node|bun):/.test(source) ||
    BUILTINS.has(source) ||
    /^(?:bun|electron|next|drizzle-orm|drizzle-kit|pg|postgres|better-sqlite3|@electron\/[^/]+|@substrate\/(?:web|desktop|database|server|harness-runtime|client-storage))(?:\/|$)/.test(
      source,
    ) ||
    source === "hono" ||
    /(?:^|\/)(?:apps\/(?:web|desktop|server)|packages\/(?:database|harness-runtime|client-storage))(?:\/|$)/.test(
      source,
    )
  );
}

export const nativeBoundaries: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Isolate DOM code in web adapters and keep all mobile code free of desktop and server runtimes.",
    },
    schema: [],
    messages: {
      import:
        'Mobile code cannot import "{{source}}". DOM libraries belong in .web adapters; desktop and server runtimes are forbidden. Only a type-only server AppType import is allowed.',
      dom: "Use React Native components and APIs. DOM code belongs in a .web adapter.",
    },
  },
  create(context) {
    const webAdapter = /\.web\.[jt]sx?$/.test(context.filename);
    function check(source: string, node: AstNode, appTypeOnly = false) {
      const path = normalized(source, context.filename);
      if (appTypeOnly && serverImport(path)) return;
      if (forbidden(path) || (!webAdapter && WEB_IMPORT.test(path)))
        context.report({ node, messageId: "import", data: { source } });
    }
    return {
      ImportDeclaration(node) {
        const appTypeOnly =
          node.specifiers.length > 0 &&
          node.specifiers.every(
            (specifier) =>
              specifier.type === "ImportSpecifier" &&
              (node.importKind === "type" || specifier.importKind === "type") &&
              (specifier.imported.type === "Identifier"
                ? specifier.imported.name
                : specifier.imported.value) === "AppType",
          );
        check(node.source.value, node.source, appTypeOnly);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node.source.value, node.source);
      },
      ExportAllDeclaration(node) {
        check(node.source.value, node.source);
      },
      ImportExpression(node) {
        const source = stringValue(node.source);
        if (source) check(source, node.source);
      },
      CallExpression(node) {
        if (
          node.callee.type !== "Identifier" ||
          node.callee.name !== "require" ||
          !globalReference(context, node.callee)
        )
          return;
        const source = stringValue(node.arguments[0]);
        if (source) check(source, node);
      },
      TSImportType(node) {
        const source = stringValue(node.source);
        const appTypeOnly =
          node.qualifier?.type === "Identifier" && node.qualifier.name === "AppType";
        if (source) check(source, node, appTypeOnly);
      },
      JSXOpeningElement(node) {
        if (!webAdapter && /^[a-z]/.test(elementName(node.name)))
          context.report({ node, messageId: "dom" });
      },
      Identifier(node) {
        if (!webAdapter && DOM_GLOBALS.has(node.name) && globalReference(context, node))
          context.report({ node, messageId: "dom" });
      },
      MemberExpression(node) {
        if (
          !webAdapter &&
          node.object.type === "Identifier" &&
          node.object.name === "globalThis" &&
          globalReference(context, node.object) &&
          DOM_GLOBALS.has(
            node.computed
              ? (stringValue(node.property) ?? "")
              : node.property.type === "Identifier"
                ? node.property.name
                : "",
          )
        )
          context.report({ node, messageId: "dom" });
      },
    };
  },
};

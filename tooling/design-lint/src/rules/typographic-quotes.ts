import {
  insideClassAttribute,
  possibleStrings,
  type AstNode,
  type NodeOf,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

// Props whose strings are read by people.
const COPY_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "cancelLabel",
  "confirmLabel",
  "description",
  "emptyDescription",
  "emptyMessage",
  "errorDescription",
  "label",
  "pendingLabel",
  "placeholder",
  "title",
]);

const STRAIGHT_APOSTROPHE = /[\p{L}\p{N}]'[\p{L}\p{N}]/u;
const STRAIGHT_DOUBLE_QUOTES = /"[^"\n]+"/;

// A sentence in a plain string: two or more words with an apostrophe inside one ("We couldn't
// save"). A single token ("it's", an id, a selector) is code, not copy.
const PROSE_APOSTROPHE = /\s\S*[\p{L}\p{N}]'[\p{L}\p{N}]|[\p{L}\p{N}]'[\p{L}\p{N}]\S*\s/u;

function straightQuote(text: string) {
  if (STRAIGHT_APOSTROPHE.test(text)) return "apostrophe";
  if (STRAIGHT_DOUBLE_QUOTES.test(text)) return "quotes";
  return undefined;
}

function calleeName(callee: AstNode): string {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed)
    return `${calleeName(callee.object)}.${calleeName(callee.property)}`;
  return "";
}

function insideJsxAttribute(node: AstNode) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "JSXAttribute") return true;
    if (current.type === "JSXElement" || current.type === "Program") return false;
  }
  return false;
}

// Parents that make a string code: module paths, types, and tagged templates.
const CODE_PARENTS = new Set<AstNode["type"]>([
  "ExportAllDeclaration",
  "ExportNamedDeclaration",
  "ImportDeclaration",
  "ImportExpression",
  "TaggedTemplateExpression",
  "TSImportType",
  "TSLiteralType",
]);

/**
 * Whether a string literal or template part is prose a person may read: not a class string, an
 * import path, an object key, a type, a log line, or an error that is thrown for developers.
 * Strings that are JSX attributes are checked by the attribute visitor.
 */
function isProse(node: AstNode, text: string) {
  if (!PROSE_APOSTROPHE.test(text) || insideClassAttribute(node) || insideJsxAttribute(node))
    return false;
  const parent = node.parent?.type === "TemplateLiteral" ? node.parent.parent : node.parent;
  if (!parent || CODE_PARENTS.has(parent.type)) return false;
  if (parent.type === "Property") return parent.value === node || parent.value === node.parent;
  if (parent.type === "NewExpression") return !calleeName(parent.callee).endsWith("Error");
  if (parent.type === "CallExpression") return !calleeName(parent.callee).startsWith("console.");
  return true;
}

export const typographicQuotes: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Write apostrophes and quotation marks in user-facing copy as typed." },
    messages: {
      apostrophe: `This copy uses a straight apostrophe ('). Write the typographic one (’): "doesn’t", "Couldn’t load". Search and the notices already use it. ${see("7 Copy")}`,
      quotes: `This copy wraps words in straight quotes ("). Use curly quotes (“ ”): No results for “ro”. ${see("7 Copy")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node: NodeOf<"JSXText">) {
        const messageId = straightQuote(node.value);
        if (messageId) context.report({ node, messageId });
      },
      // Copy kept in a variable, a map, or a call such as setError("We couldn't save.").
      Literal(node: NodeOf<"Literal">) {
        for (const { value } of possibleStrings(node)) {
          if (isProse(node, value)) context.report({ node, messageId: "apostrophe" });
        }
      },
      TemplateElement(node: NodeOf<"TemplateElement">) {
        if (isProse(node, node.value.cooked ?? ""))
          context.report({ node, messageId: "apostrophe" });
      },
      JSXAttribute(node: NodeOf<"JSXAttribute">) {
        if (node.name.type !== "JSXIdentifier" || !COPY_ATTRIBUTES.has(node.name.name)) return;
        for (const { value, node: site } of possibleStrings(node.value)) {
          const messageId = straightQuote(value);
          if (messageId) context.report({ node: site, messageId });
        }
      },
    };
  },
};

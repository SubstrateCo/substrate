import {
  insideClassAttribute,
  isRenderedChild,
  possibleStrings,
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
  "loadingMessage",
  "pendingLabel",
  "placeholder",
  "title",
]);

// "…" is only ever copy. Three dots are code (spread, rest) unless they sit in copy.
const ELLIPSIS = /…|\.\.\./;
const TYPOGRAPHIC_ELLIPSIS = /…/;

export const noEllipsis: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Do not write an ellipsis in UI text." },
    messages: {
      ellipsis: `This copy has an ellipsis. Write the label without it: "Move", "Search workspace", "Sign in". A pending button keeps its label and shows a Spinner (PendingButton); a loading region shows LoadingState or a skeleton. Visual truncation stays in CSS (truncate, line-clamp). ${see("7 Copy")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node: NodeOf<"JSXText">) {
        if (ELLIPSIS.test(node.value)) context.report({ node, messageId: "ellipsis" });
      },
      JSXAttribute(node: NodeOf<"JSXAttribute">) {
        if (node.name.type !== "JSXIdentifier" || !COPY_ATTRIBUTES.has(node.name.name)) return;
        for (const { value, node: site } of possibleStrings(node.value)) {
          if (ELLIPSIS.test(value)) context.report({ node: site, messageId: "ellipsis" });
        }
      },
      // Copy in a variable, a map, a call, or a JSX child such as {pending ? "Saving…" : "Save"}.
      Literal(node: NodeOf<"Literal">) {
        // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
        if (typeof node.value !== "string" || insideClassAttribute(node)) return;
        if (insideCopyAttribute(node)) return;
        const pattern = isRenderedChild(node) ? ELLIPSIS : TYPOGRAPHIC_ELLIPSIS;
        if (pattern.test(node.value)) context.report({ node, messageId: "ellipsis" });
      },
      TemplateElement(node: NodeOf<"TemplateElement">) {
        if (insideClassAttribute(node) || insideCopyAttribute(node)) return;
        const pattern = isRenderedChild(node) ? ELLIPSIS : TYPOGRAPHIC_ELLIPSIS;
        if (pattern.test(node.value.cooked ?? "")) context.report({ node, messageId: "ellipsis" });
      },
    };
  },
};

/** Strings inside a copy attribute are checked once, by the attribute visitor. */
function insideCopyAttribute(node: NodeOf<"Literal"> | NodeOf<"TemplateElement">) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "JSXAttribute")
      return current.name.type === "JSXIdentifier" && COPY_ATTRIBUTES.has(current.name.name);
    if (current.type === "JSXElement" || current.type === "Program") return false;
  }
  return false;
}

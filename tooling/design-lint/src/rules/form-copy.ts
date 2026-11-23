import {
  attribute,
  attributeString,
  childLabels,
  elementName,
  possibleStrings,
  type NodeOf,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

const EXAMPLE_PREFIX = /^\s*(?:e\.g\.?|eg[.:,]|ex[.:]|example:)/i;
const OPTIONAL = /\(optional\)|^\s*optional\b/i;
const DESCRIPTIONS = new Set(["FieldDescription", "FormDescription"]);

export const formCopy: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Write placeholders, optional markers, and search hints the same way." },
    messages: {
      example: `This placeholder starts with "{{prefix}}". Example placeholders start with "For example:", such as "For example: Launch plan". ${see("7 Copy")}`,
      optional: `"{{text}}" marks a field optional in its description. Put "(optional)" in the label, and only in a form that also has required fields. ${see("7 Copy")}`,
      search: `This search field says "{{placeholder}}". A search placeholder names what it searches: "Search deals". ${see("3 Pages and settings")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node: NodeOf<"JSXOpeningElement">) {
        for (const site of possibleStrings(attribute(node, "placeholder")?.value)) {
          const prefix = EXAMPLE_PREFIX.exec(site.value)?.[0];
          if (prefix)
            context.report({
              node: site.node,
              messageId: "example",
              data: { prefix: prefix.trim() },
            });
        }
        for (const site of possibleStrings(attribute(node, "description")?.value)) {
          if (OPTIONAL.test(site.value))
            context.report({ node: site.node, messageId: "optional", data: { text: site.value } });
        }
        if (elementName(node.name) === "Input" && attributeString(node, "type") === "search") {
          const placeholder = attributeString(node, "placeholder");
          if (placeholder !== undefined && !/^Search \S/.test(placeholder))
            context.report({ node, messageId: "search", data: { placeholder } });
        }
      },
      JSXElement(node: NodeOf<"JSXElement">) {
        if (!DESCRIPTIONS.has(elementName(node.openingElement.name))) return;
        for (const text of childLabels(node)) {
          if (OPTIONAL.test(text)) context.report({ node, messageId: "optional", data: { text } });
        }
      },
    };
  },
};

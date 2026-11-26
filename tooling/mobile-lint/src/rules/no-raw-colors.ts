import { stringValue, type AstNode, type Rule } from "../ast.ts";

const COLOR_PROPERTY =
  /^(?:color|backgroundColor|border(?:Top|Right|Bottom|Left|Start|End|Block|BlockStart|BlockEnd)?Color|shadowColor|textShadowColor|tintColor|overlayColor|outlineColor|fill|stroke|stopColor|placeholderTextColor|selectionColor|cursorColor|underlineColorAndroid|thumbColor|trackColor|progressBackgroundColor)$/;
const COLOR_LITERAL =
  /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(.+\)|[a-z]+)$/i;
const EXPLICIT_COLOR =
  /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(.+\))$/i;
const RAW_CLASS =
  /(?:^|:)(?:!?)(?:bg|text|border(?:-[trblxyse])?|ring|outline|shadow|fill|stroke|decoration|accent|caret|placeholder|from|via|to)-(?:\[(?:[^\]]*(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab|color)\()[^\]]*|(?:color:)?(?:red|blue|black|white|green|yellow|purple|orange|pink|gray|grey|navy|teal|aqua|lime|maroon|silver|fuchsia|olive|rebeccapurple))\]|(?:black|white)|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+)(?:\/[\w.[\]%]+)?(?:!|$)/i;

function propertyName(node: AstNode) {
  if (node.type === "Identifier") return node.name;
  return stringValue(node);
}

function withinColorProperty(node: AstNode) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "Property") return COLOR_PROPERTY.test(propertyName(parent.key) ?? "");
    if (parent.type === "JSXAttribute")
      return parent.name.type === "JSXIdentifier" && COLOR_PROPERTY.test(parent.name.name);
    if (
      parent.type !== "JSXExpressionContainer" &&
      parent.type !== "ConditionalExpression" &&
      parent.type !== "LogicalExpression" &&
      parent.type !== "TSAsExpression" &&
      parent.type !== "TemplateLiteral"
    )
      return false;
  }
  return false;
}

function rawColor(node: AstNode | null | undefined): boolean {
  const value = stringValue(node)?.trim();
  if (value !== undefined)
    return value !== "transparent" && value !== "currentColor" && COLOR_LITERAL.test(value);
  if (node?.type === "Literal" && typeof node.value === "number") return true;
  if (node?.type === "ConditionalExpression")
    return rawColor(node.consequent) || rawColor(node.alternate);
  if (node?.type === "LogicalExpression") return rawColor(node.right);
  if (node?.type === "JSXExpressionContainer" || node?.type === "TSAsExpression")
    return rawColor(node.expression);
  return false;
}

export const noRawColors: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Use semantic theme colors without restricting native layout styles." },
    schema: [],
    messages: {
      color:
        "Use a semantic theme token instead of a raw color. Literal colors belong only in theme/token adapters.",
    },
  },
  create(context) {
    function report(node: AstNode) {
      context.report({ node, messageId: "color" });
    }
    return {
      Property(node) {
        if (COLOR_PROPERTY.test(propertyName(node.key) ?? "") && rawColor(node.value))
          report(node.value);
      },
      JSXAttribute(node) {
        if (
          node.name.type === "JSXIdentifier" &&
          COLOR_PROPERTY.test(node.name.name) &&
          rawColor(node.value)
        )
          report(node);
      },
      Literal(node) {
        if (
          typeof node.value === "string" &&
          (node.value.split(/\s+/).some((token) => RAW_CLASS.test(token)) ||
            (EXPLICIT_COLOR.test(node.value.trim()) && !withinColorProperty(node)))
        )
          report(node);
      },
      TemplateElement(node) {
        const value = node.value.cooked ?? "";
        if (
          value.split(/\s+/).some((token) => RAW_CLASS.test(token)) ||
          (EXPLICIT_COLOR.test(value.trim()) && !withinColorProperty(node))
        )
          report(node);
      },
    };
  },
};

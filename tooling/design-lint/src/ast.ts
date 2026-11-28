import type { AstNode, NodeOf } from "@substrate/architecture-lint/ast";

export type { AstNode, NodeOf, Rule } from "@substrate/architecture-lint/ast";
export { elementImport, elementName } from "@substrate/architecture-lint/ast";

type OpeningElement = NodeOf<"JSXOpeningElement">;
type JsxAttribute = NodeOf<"JSXAttribute">;

export function attribute(element: OpeningElement, name: string): JsxAttribute | undefined {
  for (const item of element.attributes) {
    if (
      item.type === "JSXAttribute" &&
      item.name.type === "JSXIdentifier" &&
      item.name.name === name
    )
      return item;
  }
  return undefined;
}

export function hasSpread(element: OpeningElement) {
  return element.attributes.some((item) => item.type === "JSXSpreadAttribute");
}

function staticString(node: AstNode | null | undefined): string | undefined {
  if (!node) return undefined;
  // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
  if (node.type === "Literal") return typeof node.value === "string" ? node.value : undefined;
  if (node.type === "JSXExpressionContainer") return staticString(node.expression);
  if (node.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

export function attributeString(element: OpeningElement, name: string) {
  return staticString(attribute(element, name)?.value);
}

export type StringSite = { value: string; node: AstNode };

export function possibleStrings(node: AstNode | null | undefined): StringSite[] {
  if (!node) return [];
  if (node.type === "Literal")
    // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
    return typeof node.value === "string" ? [{ value: node.value, node }] : [];
  if (node.type === "TemplateLiteral") {
    return [
      ...node.quasis.map((quasi) => ({ value: quasi.value.cooked ?? "", node: quasi })),
      ...node.expressions.flatMap((expression) => possibleStrings(expression)),
    ];
  }
  if (node.type === "ConditionalExpression")
    return [...possibleStrings(node.consequent), ...possibleStrings(node.alternate)];
  if (node.type === "LogicalExpression")
    return [...possibleStrings(node.left), ...possibleStrings(node.right)];
  if (node.type === "ArrayExpression")
    return node.elements.flatMap((element) => possibleStrings(element));
  if (node.type === "ObjectExpression") {
    return node.properties.flatMap((property) =>
      property.type === "Property" ? possibleStrings(property.key) : [],
    );
  }
  if (node.type === "CallExpression") {
    return isClassFunction(node.callee)
      ? node.arguments.flatMap((argument) => possibleStrings(argument))
      : [];
  }
  if (
    node.type === "JSXExpressionContainer" ||
    node.type === "TSAsExpression" ||
    node.type === "TSSatisfiesExpression"
  )
    return possibleStrings(node.expression);
  return [];
}

const CLASS_FUNCTIONS = new Set([
  "cn",
  "cx",
  "clsx",
  "cva",
  "tv",
  "twMerge",
  "twJoin",
  "classNames",
]);

function isClassFunction(callee: AstNode) {
  return callee.type === "Identifier" && CLASS_FUNCTIONS.has(callee.name);
}

const TEXT_PASS_THROUGH = new Set<AstNode["type"]>([
  "JSXExpressionContainer",
  "TemplateLiteral",
  "ConditionalExpression",
  "LogicalExpression",
  "ChainExpression",
  "BinaryExpression",
]);

export function isRenderedChild(node: AstNode) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "JSXElement" || parent.type === "JSXFragment") return true;
    if (!TEXT_PASS_THROUGH.has(parent.type)) return false;
  }
  return false;
}

export function memberName(node: AstNode): string | undefined {
  if (node.type !== "MemberExpression" || node.computed) return undefined;
  return node.property.type === "Identifier" ? node.property.name : undefined;
}

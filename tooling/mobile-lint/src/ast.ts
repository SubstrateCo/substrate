import type { AstNode, Context, NodeOf } from "@substrate/architecture-lint/ast";

export type { AstNode, Context, NodeOf, Rule } from "@substrate/architecture-lint/ast";
export { elementImport, elementName } from "@substrate/architecture-lint/ast";

type Opening = NodeOf<"JSXOpeningElement">;

export function globalReference(context: Context, node: NodeOf<"Identifier">) {
  const scope = context.sourceCode.getScope(node);
  const reference = scope.references.find((item) => item.identifier === node);
  return reference !== undefined && (!reference.resolved || reference.resolved.defs.length === 0);
}

export function stringValue(node: AstNode | null | undefined): string | undefined {
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "JSXExpressionContainer") return stringValue(node.expression);
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

export function attribute(node: Opening, name: string) {
  return node.attributes.find(
    (item): item is NodeOf<"JSXAttribute"> =>
      item.type === "JSXAttribute" && item.name.type === "JSXIdentifier" && item.name.name === name,
  );
}

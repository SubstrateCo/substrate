import type { RuleTester } from "oxlint/plugins-dev";

export type Rule = Parameters<RuleTester["run"]>[1];
type CreateRule = Exclude<Rule, { createOnce: object }>;
export type Context = Parameters<CreateRule["create"]>[0];
export type AstNode = Parameters<Context["sourceCode"]["isGlobalReference"]>[0];
export type NodeOf<T extends AstNode["type"]> = Extract<AstNode, { type: T }>;
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

export function elementName(name: Opening["name"]): string {
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`;
  return `${elementName(name.object)}.${name.property.name}`;
}

export function elementImport(context: Context, node: Opening) {
  const parts = elementName(node.name).split(".");
  for (
    let scope: ReturnType<Context["sourceCode"]["getScope"]> | null =
      context.sourceCode.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(parts[0]!);
    if (!variable) continue;
    for (const definition of variable.defs) {
      if (definition.type !== "ImportBinding") continue;
      const specifier = definition.node;
      const declaration = specifier.parent;
      if (declaration?.type !== "ImportDeclaration" || declaration.importKind === "type") continue;
      if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type") {
        if (parts.length !== 1) return;
        return {
          source: declaration.source.value,
          name:
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : specifier.imported.value,
        };
      }
      if (specifier.type === "ImportNamespaceSpecifier" && parts.length === 2)
        return { source: declaration.source.value, name: parts[1]! };
    }
    return;
  }
}

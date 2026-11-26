import type { RuleTester } from "oxlint/plugins-dev";

export type Rule = Parameters<RuleTester["run"]>[1];
type CreateRule = Exclude<Rule, { createOnce: object }>;
export type Context = Parameters<CreateRule["create"]>[0];
export type AstNode = Parameters<Context["sourceCode"]["isGlobalReference"]>[0];
export type NodeOf<T extends AstNode["type"]> = Extract<AstNode, { type: T }>;
type OpeningElement = NodeOf<"JSXOpeningElement">;

/** The written name of a JSX element: `Button`, `h1`, or `Tooltip.Trigger`. */
export function elementName(name: OpeningElement["name"]): string {
  if (name.type === "JSXIdentifier") return name.name;
  if (name.type === "JSXNamespacedName") return `${name.namespace.name}:${name.name.name}`;
  return `${elementName(name.object)}.${name.property.name}`;
}

/** The import behind a JSX name, without mistaking a shadowing local for that import. */
export function elementImport(context: Context, node: OpeningElement) {
  const parts = elementName(node.name).split(".");
  const local = parts[0]!;
  for (
    let scope: ReturnType<Context["sourceCode"]["getScope"]> | null =
      context.sourceCode.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(local);
    if (!variable) continue;
    for (const definition of variable.defs) {
      if (definition.type !== "ImportBinding") continue;
      const specifier = definition.node;
      const declaration = specifier.parent;
      if (declaration?.type !== "ImportDeclaration" || declaration.importKind === "type") continue;
      if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type") {
        if (parts.length !== 1) return;
        const imported = specifier.imported;
        return {
          source: declaration.source.value,
          name: imported.type === "Identifier" ? imported.name : imported.value,
        };
      }
      if (specifier.type === "ImportNamespaceSpecifier" && parts.length === 2)
        return { source: declaration.source.value, name: parts[1]! };
    }
    return;
  }
}

/**
 * The dotted path of an identifier or a member chain: `c.req.json`. A base that is not a
 * name, such as a call result, is written `()`: `z.object({}).parse` is `().parse`.
 */
export function memberPath(node: AstNode): string {
  if (node.type === "Identifier") return node.name;
  if (node.type === "ThisExpression") return "this";
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier")
    return `${memberPath(node.object)}.${node.property.name}`;
  return "()";
}

/**
 * Compiles a path pattern. `*` matches one name, `**` matches any run of names and dots, and
 * `{a,b}` matches either alternative: `*.req.{json,query}`, `**.safeParse`.
 */
export function pathPattern(pattern: string) {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "*" && pattern[i + 1] === "*") {
      source += ".*";
      i++;
    } else if (ch === "*") source += "[\\w$]*";
    else if (ch === "{") {
      const end = pattern.indexOf("}", i);
      source += `(?:${pattern
        .slice(i + 1, end)
        .split(",")
        .map((part) => part.replace(/[.$]/g, "\\$&"))
        .join("|")})`;
      i = end;
    } else source += ch.replace(/[.$()]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/** Whether the name is bound by an import in the module scope around the node. */
export function isImportBinding(context: Context, node: AstNode, name: string) {
  for (
    let scope: ReturnType<Context["sourceCode"]["getScope"]> | null =
      context.sourceCode.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(name);
    if (variable) return variable.defs.some((def) => def.type === "ImportBinding");
  }
  return false;
}

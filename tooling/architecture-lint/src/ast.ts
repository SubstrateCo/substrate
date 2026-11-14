import type { RuleTester } from "oxlint/plugins-dev";

export type Rule = Parameters<RuleTester["run"]>[1];
type CreateRule = Exclude<Rule, { createOnce: object }>;
export type Context = Parameters<CreateRule["create"]>[0];
export type AstNode = Parameters<Context["sourceCode"]["isGlobalReference"]>[0];
export type NodeOf<T extends AstNode["type"]> = Extract<AstNode, { type: T }>;

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

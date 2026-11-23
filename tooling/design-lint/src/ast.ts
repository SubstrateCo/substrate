import type { AstNode, Context, NodeOf } from "@substrate/architecture-lint/ast";

export type { AstNode, Context, NodeOf, Rule } from "@substrate/architecture-lint/ast";

type OpeningElement = NodeOf<"JSXOpeningElement">;
type JsxAttribute = NodeOf<"JSXAttribute">;

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

/** A string the expression always evaluates to, such as `"icon-sm"` or `` `icon-sm` ``. */
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

/**
 * The strings an expression can produce through literals, templates, conditionals, logical
 * operators, arrays, and object keys, which is the shape `cn(...)` and `clsx(...)` accept.
 */
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

const CLASS_ATTRIBUTES = new Set(["className", "class"]);

/**
 * Visitors that call `check` once for every class string in a file: `className` values and
 * the arguments of class helpers (`cn`, `cva`, ...) outside a `className`.
 */
export function classStringVisitors(check: (site: StringSite) => void) {
  return {
    JSXAttribute(node: JsxAttribute) {
      if (node.name.type !== "JSXIdentifier" || !CLASS_ATTRIBUTES.has(node.name.name)) return;
      for (const site of possibleStrings(node.value)) check(site);
    },
    CallExpression(node: NodeOf<"CallExpression">) {
      if (!isClassFunction(node.callee) || insideClassAttribute(node)) return;
      for (const argument of node.arguments) {
        // cva's second argument is the variants object; its values are the class strings.
        if (argument.type === "ObjectExpression") {
          for (const site of objectValueStrings(argument)) check(site);
        } else {
          for (const site of possibleStrings(argument)) check(site);
        }
      }
    },
  };
}

export type ClassList = { tokens: ReturnType<typeof classTokens>; node: AstNode };

/**
 * Visitors that call `check` once for every class list: all tokens one `className` can produce
 * (every branch of a `cn(...)`), or the arguments of one class helper outside a `className`.
 * Use it when a rule needs to see tokens together, such as a size beside its weight.
 */
export function classListVisitors(check: (list: ClassList) => void) {
  const tokensOf = (sites: StringSite[]) => sites.flatMap((site) => classTokens(site.value));
  return {
    JSXAttribute(node: JsxAttribute) {
      if (node.name.type !== "JSXIdentifier" || !CLASS_ATTRIBUTES.has(node.name.name)) return;
      check({ tokens: tokensOf(possibleStrings(node.value)), node });
    },
    CallExpression(node: NodeOf<"CallExpression">) {
      if (!isClassFunction(node.callee) || insideClassAttribute(node)) return;
      const sites = node.arguments.flatMap((argument) =>
        argument.type === "ObjectExpression"
          ? objectValueStrings(argument)
          : possibleStrings(argument),
      );
      check({ tokens: tokensOf(sites), node });
    },
  };
}

function objectValueStrings(node: NodeOf<"ObjectExpression">): StringSite[] {
  return node.properties.flatMap((property) => {
    if (property.type !== "Property") return [];
    if (property.value.type === "ObjectExpression") return objectValueStrings(property.value);
    if (property.value.type === "ArrayExpression") {
      return property.value.elements.flatMap((element) =>
        element?.type === "ObjectExpression"
          ? objectValueStrings(element)
          : possibleStrings(element),
      );
    }
    return [...possibleStrings(property.key), ...possibleStrings(property.value)];
  });
}

/** Whether a node is part of a `className` value or an argument of `cn(...)`, `cva(...)`, etc. */
export function insideClassAttribute(node: AstNode) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "JSXAttribute")
      return current.name.type === "JSXIdentifier" && CLASS_ATTRIBUTES.has(current.name.name);
    if (current.type === "CallExpression" && isClassFunction(current.callee)) return true;
    if (current.type === "JSXElement" || current.type === "Program") return false;
  }
  return false;
}

/** Class tokens with their variant prefixes and important markers removed: `hover:!p-2` → `p-2`. */
export function classTokens(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => ({
      token,
      base: (token.split(":").pop() ?? token).replace(/^!|!$/g, ""),
    }));
}

function isNode(value: unknown): value is AstNode {
  return (
    // oxlint-disable-next-line deslop/no-runtime-typeof -- Visitor-key values can be nodes, scalars, or null; validate them before traversing.
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  );
}

/** Every node below `node`, depth first, including inside callbacks such as `items.map(...)`. */
export function* descendants(context: Context, node: AstNode): Generator<AstNode> {
  for (const key of context.sourceCode.visitorKeys[node.type] ?? []) {
    // oxlint-disable-next-line deslop/no-reflect-get -- oxlint exposes lazy node fields through visitorKeys; the key depends on the node kind.
    const value: unknown = Reflect.get(node, key);
    for (const child of Array.isArray(value) ? value : [value]) {
      if (!isNode(child)) continue;
      yield child;
      yield* descendants(context, child);
    }
  }
}

/** The JSX elements around a node, nearest first. */
export function* enclosingElements(node: AstNode) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type === "JSXElement") yield current;
  }
}

// Expressions that pass a value through to the text they produce.
const TEXT_PASS_THROUGH = new Set<AstNode["type"]>([
  "JSXExpressionContainer",
  "TemplateLiteral",
  "ConditionalExpression",
  "LogicalExpression",
  "ChainExpression",
  "BinaryExpression",
]);

/** Whether a value ends up as JSX children, where it is rendered to the page as text. */
export function isRenderedChild(node: AstNode) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "JSXElement" || parent.type === "JSXFragment") return true;
    if (!TEXT_PASS_THROUGH.has(parent.type)) return false;
  }
  return false;
}

/**
 * The labels an element can show through its own children: its JSX text joined, or, for a child
 * such as `{pending ? "Saving" : "Save"}`, each string it can produce. Nested elements are skipped.
 */
export function childLabels(element: NodeOf<"JSXElement">): string[] {
  const text = element.children
    .flatMap((child) => (child.type === "JSXText" ? [child.value] : []))
    .join(" ")
    .replaceAll(/\s+/g, " ")
    .trim();
  const expressions = element.children.flatMap((child) =>
    child.type === "JSXExpressionContainer"
      ? possibleStrings(child.expression).map((site) => site.value.trim())
      : [],
  );
  return [text, ...expressions].filter(Boolean);
}

/** The property name of `a.b` or `a?.b`, or undefined for computed access. */
export function memberName(node: AstNode): string | undefined {
  if (node.type !== "MemberExpression" || node.computed) return undefined;
  return node.property.type === "Identifier" ? node.property.name : undefined;
}

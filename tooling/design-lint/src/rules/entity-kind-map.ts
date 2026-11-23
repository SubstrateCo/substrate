import type { AstNode, Context, NodeOf, Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

const RECORD_KINDS = new Set([
  "task",
  "project",
  "contact",
  "account",
  "deal",
  "interaction",
  "person",
  "agent",
  "channel",
  "thread",
  "message",
]);
const MIN_KINDS = 3;

function keyName(property: NodeOf<"Property">) {
  if (property.computed) return undefined;
  if (property.key.type === "Identifier") return property.key.name;
  // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
  if (property.key.type === "Literal" && typeof property.key.value === "string")
    return property.key.value;
  return undefined;
}

/** Whether an identifier is an import from lucide-react. */
function isLucideIcon(context: Context, node: AstNode) {
  if (node.type !== "Identifier") return false;
  for (
    let scope: ReturnType<Context["sourceCode"]["getScope"]> | null =
      context.sourceCode.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(node.name);
    if (!variable) continue;
    return variable.defs.some(
      (definition) =>
        definition.type === "ImportBinding" &&
        definition.node.parent?.type === "ImportDeclaration" &&
        definition.node.parent.source.value === "lucide-react",
    );
  }
  return false;
}

/** The icon a kind entry carries: the value itself, or its `icon` property. */
function kindIcon(value: AstNode): AstNode | undefined {
  if (value.type !== "ObjectExpression") return value;
  for (const property of value.properties) {
    if (property.type === "Property" && keyName(property) === "icon") return property.value;
  }
  return undefined;
}

export const entityKindMap: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Take record-kind icons from entityKinds, not a local map." },
    messages: {
      localMap: `This object maps record kinds ({{kinds}}) to icons. Use entityKinds from "@/components/context/entity-kinds", which gives every kind its one icon and singular label, so a kind looks the same on every screen. ${see("4 Icons")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      ObjectExpression(node: NodeOf<"ObjectExpression">) {
        const kinds = node.properties.flatMap((property) => {
          if (property.type !== "Property") return [];
          const key = keyName(property);
          if (!key || !RECORD_KINDS.has(key)) return [];
          const icon = kindIcon(property.value);
          return icon && isLucideIcon(context, icon) ? [key] : [];
        });
        if (kinds.length >= MIN_KINDS)
          context.report({ node, messageId: "localMap", data: { kinds: kinds.join(", ") } });
      },
    };
  },
};

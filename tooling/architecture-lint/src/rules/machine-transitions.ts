import type { AstNode, Context, NodeOf, Rule } from "../ast.ts";

interface EventRef {
  machine: string;
  event: string;
}

interface MachineTransitionsOptions {
  allStatusWrites?: boolean;
}

const MACHINE_DIR = "packages/contracts/src/agent-work/machines/";

function keyOf(node: AstNode): string | undefined {
  if (node.type === "Identifier") return `id:${node.name}`;
  // oxlint-disable-next-line deslop/no-runtime-typeof -- ESTree Literal values include strings, numbers, booleans, and null.
  if (node.type === "Literal" && typeof node.value === "string") return `name:${node.value}`;
  return undefined;
}

function propertyName(node: AstNode): string | undefined {
  if (node.type !== "MemberExpression" || node.computed) return undefined;
  return node.property.type === "Identifier" ? node.property.name : undefined;
}

function eventField(node: AstNode, field: "to" | "from"): EventRef | undefined {
  if (propertyName(node) !== field || node.type !== "MemberExpression") return undefined;
  const events = node.object;
  if (events.type !== "MemberExpression") return undefined;
  const machines = events.object;
  if (propertyName(machines) !== "events" || machines.type !== "MemberExpression") return undefined;
  if (machines.object.type !== "Identifier") return undefined;
  const event = events.computed ? keyOf(events.property) : `name:${propertyName(events)}`;
  return event === undefined ? undefined : { machine: machines.object.name, event };
}

function fromCall(node: AstNode): EventRef | undefined {
  if (node.type !== "CallExpression" || propertyName(node.callee) !== "from") return undefined;
  const { callee } = node;
  if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") return undefined;
  const argument = node.arguments.at(0);
  const event = argument && keyOf(argument);
  return event === undefined ? undefined : { machine: callee.object.name, event };
}

function constInit(context: Context, node: NodeOf<"Identifier">): AstNode | undefined {
  for (
    let scope: ReturnType<Context["sourceCode"]["getScope"]> | null =
      context.sourceCode.getScope(node);
    scope;
    scope = scope.upper
  ) {
    const variable = scope.set.get(node.name);
    if (!variable) continue;
    const def = variable.defs.at(0);
    if (variable.defs.length !== 1 || def?.type !== "Variable") return undefined;
    const declarator = def.node;
    const declaration = declarator.parent;
    if (declarator.type !== "VariableDeclarator" || declaration?.type !== "VariableDeclaration")
      return undefined;
    return declaration.kind === "const" ? (declarator.init ?? undefined) : undefined;
  }
  return undefined;
}

function statusEvent(context: Context, value: AstNode): EventRef | undefined {
  if (value.type !== "Identifier") return eventField(value, "to");
  const init = constInit(context, value);
  return init && eventField(init, "to");
}

function* walk(context: Context, node: AstNode): Generator<AstNode> {
  yield node;
  for (const key of context.sourceCode.visitorKeys[node.type] ?? []) {
    // oxlint-disable-next-line deslop/no-reflect-get -- oxlint exposes lazy node fields through visitorKeys; the key depends on the node kind.
    const value: unknown = Reflect.get(node, key);
    for (const child of Array.isArray(value) ? value : [value]) {
      // oxlint-disable-next-line deslop/no-runtime-typeof -- Visitor-key values can be nodes, scalars, or null; validate them before traversing.
      if (typeof child === "object" && child !== null && "type" in child)
        yield* walk(context, child);
    }
  }
}

function checksFromStates(context: Context, where: NodeOf<"CallExpression">, event: EventRef) {
  return where.arguments.some((argument) => {
    for (const child of walk(context, argument)) {
      const from = fromCall(child) ?? eventField(child, "from");
      if (from) {
        if (from.machine === event.machine && from.event === event.event) return true;
        continue;
      }
      const guard =
        child.type === "CallExpression" &&
        child.callee.type === "Identifier" &&
        child.arguments.length === 1;
      if (guard && keyOf(child.arguments[0]) === event.event) return true;
    }
    return false;
  });
}

function chainedWhere(set: NodeOf<"CallExpression">) {
  const member = set.parent;
  if (propertyName(member) !== "where") return undefined;
  return member.parent?.type === "CallExpression" ? member.parent : undefined;
}

function statusWrite(node: NodeOf<"CallExpression">) {
  const { callee } = node;
  if (propertyName(callee) !== "set" || callee.type !== "MemberExpression") return undefined;
  const updated = callee.object;
  if (updated.type !== "CallExpression" || propertyName(updated.callee) !== "update")
    return undefined;
  const values = node.arguments.at(0);
  if (values?.type !== "ObjectExpression") return undefined;
  for (const property of values.properties) {
    if (property.type !== "Property" || property.computed) continue;
    if (property.key.type === "Identifier" && property.key.name === "status") return property;
  }
  return undefined;
}

const fromLabel = ({ machine, event }: EventRef) =>
  `${machine}.from(${event.startsWith("name:") ? `"${event.slice(5)}"` : event.slice(3)})`;

export const machineTransitions: Rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Write statuses only through a machine event's compare-and-set.",
    },
    messages: {
      notEvent: `This update writes \`status\` from a value that is not a machine event. Write \`<machine>.events.<event>.to\` (or a const holding it), and add the transition to the machine table in ${MACHINE_DIR} first.`,
      noWhere:
        "This update writes `{{machine}}` status without a `.where()`. Match the event's from states: `.where(and(..., inStates(table.status, {{from}})))`.",
      noFrom:
        "This update writes `{{machine}}` status, but its `.where()` does not check {{from}}. Match the event's from states with `inStates(table.status, {{from}})`, or a guard helper that takes the same event.",
    },
    schema: [
      {
        type: "object",
        properties: { allStatusWrites: { type: "boolean" } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    // SAFETY: oxlint validates the options against the schema above before the rule runs.
    const options = (context.options[0] ?? {}) as MachineTransitionsOptions;
    return {
      CallExpression(node) {
        const status = statusWrite(node);
        if (!status) return;
        const event = statusEvent(context, status.value);
        if (!event) {
          if (options.allStatusWrites) context.report({ node: status, messageId: "notEvent" });
          return;
        }
        const data = { machine: event.machine, from: fromLabel(event) };
        const where = chainedWhere(node);
        if (!where) context.report({ node: status, messageId: "noWhere", data });
        else if (!checksFromStates(context, where, event))
          context.report({ node: status, messageId: "noFrom", data });
      },
    };
  },
};

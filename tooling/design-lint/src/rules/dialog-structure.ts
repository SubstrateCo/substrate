import {
  attributeString,
  type AstNode,
  type Context,
  descendants,
  elementName,
  enclosingElements,
  type NodeOf,
  type Rule,
} from "../ast.ts";

type Element = NodeOf<"JSXElement">;

// Imports whose components never render a DialogTitle.
const SEEN_THROUGH = /^(?:@\/components\/ui\/|lucide-react$|radix-ui$|react$)/;

function importSources(context: Context) {
  const sources = new Map<string, string>();
  for (const statement of context.sourceCode.ast.body) {
    if (statement.type !== "ImportDeclaration") continue;
    for (const specifier of statement.specifiers)
      sources.set(specifier.local.name, statement.source.value);
  }
  return sources;
}

function elementsIn(context: Context, node: AstNode) {
  const elements: Element[] = [];
  for (const child of descendants(context, node))
    if (child.type === "JSXElement") elements.push(child);
  return elements;
}

/** The nearest enclosing Dialog part (DialogHeader, DialogBody, DialogFooter, DialogContent). */
function nearestDialogPart(node: AstNode) {
  for (const element of enclosingElements(node)) {
    const name = elementName(element.openingElement.name);
    if (/^Dialog(?:Header|Body|Footer|Content)$/.test(name)) return name;
  }
  return undefined;
}

export const dialogStructure: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: "Build dialogs from DialogHeader, DialogBody, and DialogFooter." },
    messages: {
      noTitle:
        '<DialogContent> has no DialogTitle, so screen readers announce an unnamed dialog and the close X has no title line to sit on. Start with <DialogHeader><DialogTitle>New task</DialogTitle><DialogDescription>…</DialogDescription></DialogHeader> from "@/components/ui/dialog".',
      titleOutsideHeader:
        '<DialogTitle> sits outside DialogHeader, so it loses the header inset (px-5 pt-5 pb-4) and no longer lines up with the close X. Wrap the title and description in <DialogHeader> from "@/components/ui/dialog".',
      actionOutsideFooter:
        'This submit button sits outside DialogFooter, so it scrolls away with the body and breaks the fixed footer band. Put actions in <DialogFooter> (inside the <form>, after <DialogBody>): Cancel (variant="outline") first, then the primary action.',
    },
    schema: [],
  },
  create(context) {
    let sources: Map<string, string> | undefined;

    /** A component this file cannot see into, which might render the dialog title itself. */
    function opaque(element: Element) {
      const name = elementName(element.openingElement.name);
      if (!/^[A-Z]/.test(name)) return false;
      sources ??= importSources(context);
      const source = sources.get(name.split(".")[0] ?? name);
      return !source || !SEEN_THROUGH.test(source);
    }

    return {
      JSXElement(node) {
        const name = elementName(node.openingElement.name);
        if (name === "DialogTitle") {
          const part = nearestDialogPart(node);
          if (part && part !== "DialogHeader")
            context.report({ node: node.openingElement, messageId: "titleOutsideHeader" });
          return;
        }
        if (name.endsWith("Button") && attributeString(node.openingElement, "type") === "submit") {
          const part = nearestDialogPart(node);
          if (part === "DialogContent" || part === "DialogBody")
            context.report({ node: node.openingElement, messageId: "actionOutsideFooter" });
          return;
        }
        if (name !== "DialogContent") return;
        const inside = elementsIn(context, node);
        const hasTitle = inside.some(
          (element) => elementName(element.openingElement.name) === "DialogTitle",
        );
        if (!hasTitle && !inside.some(opaque))
          context.report({ node: node.openingElement, messageId: "noTitle" });
      },
    };
  },
};

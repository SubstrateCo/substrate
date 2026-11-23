import { attribute, attributeString, elementName, type NodeOf, type Rule } from "../ast.ts";

const ui = (component: string, file: string) => `<${component}> from "@/components/ui/${file}"`;
const HEADING = `${ui("Heading", "heading")} with a level and a variant (page, record, section, title, label, or inherit inside CardTitle and EmptyTitle)`;
const TABLE = '<AppTable> from "@/components/table/app-table"';

/** What to use instead of each raw element. */
const REPLACEMENTS: Record<string, string> = {
  button: `${ui("Button", "button")}. For a click target without button chrome (a row or card target, a name that opens a card, a text-like action) use ${ui("Pressable", "pressable")}`,
  input: `${ui("Input", "input")}, ${ui("Checkbox", "checkbox")}, ${ui("RadioGroupItem", "radio-group")}, ${ui("Switch", "switch")}, or <DateField>. A raw input is only for type="hidden" and type="file"`,
  select: ui("Select", "select"),
  textarea: ui("Textarea", "textarea"),
  label: `${ui("Label", "label")} (variant="caption" for a quiet label beside a compact control, variant="row" for a checkbox list row), or FieldLabel from "@/components/ui/field" for a form field or a choice card around a Field`,
  img: `${ui("Image", "image")}, which loads lazily, swaps darkSrc in dark mode, and shows a fallback when the source fails`,
  dialog: ui("Dialog", "dialog"),
  hr: ui("Separator", "separator"),
  kbd: ui("Kbd", "kbd"),
  table: TABLE,
  thead: TABLE,
  tbody: TABLE,
  tfoot: TABLE,
  tr: TABLE,
  th: TABLE,
  td: TABLE,
  h1: HEADING,
  h2: HEADING,
  h3: HEADING,
  h4: HEADING,
  h5: HEADING,
  h6: HEADING,
};

// No primitive draws these: a hidden input carries form data, and a file input is the picker.
const NATIVE_INPUT_TYPES = new Set(["hidden", "file"]);
// Primitives that style the element they render through `asChild`, such as <Item asChild><li>.
const STYLING_PARENTS = new Set(["Item", "Button"]);

function styledByParent(node: NodeOf<"JSXOpeningElement">) {
  const parent = node.parent.parent;
  if (parent?.type !== "JSXElement") return false;
  const opening = parent.openingElement;
  return STYLING_PARENTS.has(elementName(opening.name)) && !!attribute(opening, "asChild");
}

export const noNativeElement: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Build views from the UI primitives instead of raw HTML controls." },
    messages: {
      native:
        "<{{tag}}> is a raw element, so it skips the primitive's styles, states, and accessibility. Use {{replacement}}.",
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const tag = elementName(node.name);
        const replacement = REPLACEMENTS[tag];
        if (!replacement) return;
        if (tag === "input" && NATIVE_INPUT_TYPES.has(attributeString(node, "type") ?? "")) return;
        if (styledByParent(node)) return;
        context.report({ node, messageId: "native", data: { tag, replacement } });
      },
    };
  },
};

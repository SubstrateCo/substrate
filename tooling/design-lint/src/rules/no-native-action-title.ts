import { attribute, elementImport, elementName, type Rule } from "../ast.ts";

export const noNativeActionTitle: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Use Tooltip instead of native titles on buttons and menu items." },
    messages: {
      title:
        'Do not put a native title on a button or menu item. Use Tooltip from "@/components/ui/tooltip"; icon-only buttons also need an accessible name such as aria-label.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (!attribute(node, "title")) return;
        if (elementName(node.name) !== "button") {
          const imported = elementImport(context, node);
          if (!imported) return;
          const module = imported.source.replace(/\.[jt]sx?$/, "");
          const action =
            (imported.name === "Button" && module.endsWith("/ui/button")) ||
            (imported.name === "Pressable" && module.endsWith("/ui/pressable")) ||
            (/^DropdownMenu(?:Checkbox|Radio)?Item$/.test(imported.name) &&
              module.endsWith("/ui/dropdown-menu"));
          if (!action || !/^(?:@\/components\/|\.\.?\/)/.test(module)) return;
        }
        context.report({ node, messageId: "title" });
      },
    };
  },
};

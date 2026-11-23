import { attributeString, elementImport, type Rule } from "../ast.ts";

export const noNativeDateInput: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Use DateField for date-only form fields." },
    messages: {
      date: 'Use <DateField> from "@/components/forms/date-field" for a date-only field. It provides quick choices, a typed date, a calendar, and Clear date. Date-and-time inputs can keep type="datetime-local".',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        // A raw <input type="date"> is reported by no-native-element.
        if (attributeString(node, "type") !== "date") return;
        const imported = elementImport(context, node);
        if (!imported) return;
        const module = imported.source.replace(/\.[jt]sx?$/, "");
        const field =
          (imported.name === "Input" && module.endsWith("/ui/input")) ||
          (imported.name === "NativeField" && module.endsWith("/forms/native-form")) ||
          (imported.name === "FormTextField" && module.endsWith("/forms/form-text-field"));
        if (!field || !/^(?:@\/components\/|\.\.?\/)/.test(module)) return;
        context.report({ node, messageId: "date" });
      },
    };
  },
};

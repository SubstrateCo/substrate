import { elementImport, type Rule } from "../ast.ts";

const RAW_BUTTONS = new Set([
  "Pressable",
  "TouchableOpacity",
  "TouchableHighlight",
  "TouchableWithoutFeedback",
  "TouchableNativeFeedback",
  "Button",
]);

export const usePrimitives: Rule = {
  meta: {
    type: "problem",
    docs: { description: "Use the shared native button primitives for app actions." },
    schema: [],
    messages: {
      button:
        "Use the shared Button or an accessible app primitive. Raw touch targets belong in components/ui, components/gestures, or components/editor.",
      primitive:
        "Import the shared component from components/ui, not the underlying React Native Reusables primitive.",
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const imported = elementImport(context, node);
        if (!imported || !RAW_BUTTONS.has(imported.name)) return;
        if (
          imported.source === "react-native" ||
          imported.source === "react-native-gesture-handler"
        )
          context.report({ node, messageId: "button" });
      },
      ImportDeclaration(node) {
        if (!node.source.value.startsWith("@rn-primitives/") || node.importKind === "type") return;
        if (
          node.specifiers.length === 0 ||
          node.specifiers.some(
            (specifier) =>
              specifier.type !== "ImportSpecifier" ||
              (specifier.importKind !== "type" &&
                !(
                  node.source.value === "@rn-primitives/portal" &&
                  specifier.imported.type === "Identifier" &&
                  specifier.imported.name === "PortalHost"
                )),
          )
        )
          context.report({ node: node.source, messageId: "primitive" });
      },
    };
  },
};

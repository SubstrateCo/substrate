import {
  attributeString,
  childLabels,
  elementName,
  enclosingElements,
  type NodeOf,
  type Rule,
} from "../ast.ts";
import { see } from "../design-doc.ts";

const BUTTON = /(?:^|\.)\w*Button$|^button$/;
// A settings save that names what it saves. "Save picture" or "Save new password" names an object.
const SETTINGS_SAVE = /^Save (?:changes|.*\bsettings)$/i;

export const actionCopy: Rule = {
  meta: {
    type: "suggestion",
    docs: { description: 'Use "Save", "New <thing>", and "Create <thing>" for edit and create.' },
    messages: {
      save: `This button says "{{label}}". An edit saves with "Save" (and "Discard"); for a settings card use <SettingsFooter> from "@/components/layout/settings-section", which owns those labels. ${see("7 Copy")}`,
      title: `This dialog title says "{{label}}". The trigger and the title say "New <thing>"; only the submit button says "Create <thing>". ${see("7 Copy")}`,
      submit: `This submit button says "{{label}}". A create dialog submits with "Create <thing>"; "New <thing>" is for the trigger and the title. ${see("7 Copy")}`,
    },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node: NodeOf<"JSXElement">) {
        const opening = node.openingElement;
        const name = elementName(opening.name);
        const report = (messageId: string, label: string) =>
          context.report({ node: opening, messageId, data: { label } });
        if (name === "DialogTitle") {
          for (const label of childLabels(node)) if (/^Create /.test(label)) report("title", label);
          return;
        }
        if (!BUTTON.test(name)) return;
        for (const label of childLabels(node)) {
          if (SETTINGS_SAVE.test(label)) report("save", label);
          else if (
            /^New /.test(label) &&
            attributeString(opening, "type") === "submit" &&
            [...enclosingElements(node)].some(
              (parent) => elementName(parent.openingElement.name) === "DialogFooter",
            )
          )
            report("submit", label);
        }
      },
    };
  },
};

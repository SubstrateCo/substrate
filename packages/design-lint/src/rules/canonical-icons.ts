import type { NodeOf, Rule } from "../ast.ts";
import { see } from "../design-doc.ts";

type Canonical = { icon: string; concept: string };

const concept = (icon: string, name: string, aliases: string[]) =>
  aliases.map((alias) => [alias, { icon, concept: name }] as const);

/** Lucide names that stand for a concept the design contract already gives one icon. */
const ICON_ALIASES: ReadonlyMap<string, Canonical> = new Map([
  ...concept("Plus", "create, add, or new", [
    "CirclePlus",
    "PlusCircle",
    "SquarePlus",
    "PlusSquare",
    "ListPlus",
  ]),
  ...concept("Trash2", "delete", ["Trash"]),
  ...concept("UserMinus", "remove a person or access", ["UserX", "UserRoundMinus", "UserRoundX"]),
  ...concept("UserPlus", "add people", ["UserRoundPlus"]),
  ...concept("Pencil", "edit", [
    "Edit",
    "Edit2",
    "Edit3",
    "Pen",
    "PenLine",
    "PencilLine",
    "SquarePen",
    "PenSquare",
  ]),
  ...concept("Ellipsis", "more actions", ["MoreHorizontal", "MoreVertical", "EllipsisVertical"]),
  ...concept("Settings", "settings", ["Settings2", "Cog"]),
  ...concept("Link2", "link", ["Link"]),
  ...concept("Unlink", "unlink", ["Unlink2", "Link2Off"]),
  ...concept("ArrowUpRight", "open elsewhere", [
    "ExternalLink",
    "SquareArrowOutUpRight",
    "ArrowUpRightFromSquare",
    "MoveUpRight",
  ]),
  ...concept("ArrowLeft", "back", ["MoveLeft", "ArrowLeftCircle", "CircleArrowLeft"]),
  // RotateCw stays available: rotating an image is its own concept.
  ...concept("RefreshCw", "retry or refresh", ["RefreshCcw"]),
  ...concept("CircleAlert", "error", ["AlertCircle", "OctagonAlert", "AlertOctagon"]),
  ...concept("TriangleAlert", "warning", ["AlertTriangle"]),
  ...concept("LogOut", "leave", ["DoorOpen"]),
  ...concept("Globe", "external collaboration", ["Globe2", "Earth"]),
  ...concept("Laptop", "device", ["Laptop2", "LaptopMinimal"]),
  ...concept("LockKeyhole", "private", ["Lock"]),
  ...concept("UserRound", "person", ["User"]),
  ...concept("Copy", "copy", ["ClipboardCopy"]),
  ...concept("CircleCheck", "done", ["CheckCircle", "CheckCircle2", "CircleCheckBig"]),
]);

// Names whose plain form would shadow a browser global, so the suffixed import is correct.
const SUFFIX_REQUIRED = new Set(["Image", "File", "Map", "Option", "Text", "Type"]);
const NOT_ICONS = new Set(["LucideIcon", "LucideProps", "Icon", "createLucideIcon", "icons"]);

function plainName(name: string) {
  const match = /^Lucide([A-Z]\w*)$/.exec(name) ?? /^([A-Z]\w*?)Icon$/.exec(name);
  const base = match?.[1];
  if (!base || SUFFIX_REQUIRED.has(base)) return undefined;
  return base;
}

export const canonicalIcons: Rule = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: { description: "Use the one lucide icon the design contract gives each concept." },
    messages: {
      alias: `"{{name}}" is not the icon for {{concept}}. One icon per concept keeps actions recognizable on every screen. Import {{icon}} from "lucide-react". ${see("4 Icons")}`,
      suffix: `Import "{{icon}}" from "lucide-react", not "{{name}}". Outside components/ui, icons use their plain names so each icon has one spelling. ${see("4 Icons")}`,
    },
    schema: [],
  },
  create(context) {
    /** The identifiers a rename must rewrite, or undefined when a rename is not safe. */
    function renameTargets(specifier: NodeOf<"ImportSpecifier">, icon: string) {
      if (specifier.imported.type !== "Identifier") return undefined;
      if (specifier.local.name !== specifier.imported.name) return undefined;
      const variable = context.sourceCode.getDeclaredVariables(specifier).at(0);
      // Renaming onto a name already bound in this module would change which value is used.
      if (!variable || variable.scope.set.has(icon)) return undefined;
      return [
        specifier,
        ...variable.references
          .map((reference) => reference.identifier)
          .filter((identifier) => identifier !== specifier.local),
      ];
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "lucide-react" || node.importKind === "type") return;
        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue;
          const name =
            specifier.imported.type === "Literal"
              ? specifier.imported.value
              : specifier.imported.name;
          if (NOT_ICONS.has(name)) continue;
          const plain = plainName(name);
          const alias = ICON_ALIASES.get(plain ?? name);
          const icon = alias?.icon ?? plain;
          if (!icon) continue;
          const targets = renameTargets(specifier, icon);
          context.report({
            node: specifier,
            messageId: alias ? "alias" : "suffix",
            data: { name, icon, concept: alias?.concept ?? "" },
            fix: targets && ((fixer) => targets.map((target) => fixer.replaceText(target, icon))),
          });
        }
      },
    };
  },
};

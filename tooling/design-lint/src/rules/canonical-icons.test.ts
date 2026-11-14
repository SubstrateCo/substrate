import { ruleTester } from "../test-support.ts";
import { canonicalIcons } from "./canonical-icons.ts";

ruleTester.run("canonical-icons", canonicalIcons, {
  valid: [
    'import { Plus, Trash2, Ellipsis, Settings, CircleAlert } from "lucide-react";',
    // Types and helpers are not icons.
    'import { type LucideIcon, Inbox } from "lucide-react";',
    'import type { LucideProps } from "lucide-react";',
    // A plain Image would shadow the browser global.
    'import { ImageIcon } from "lucide-react";',
    // Rotating an image is not "refresh".
    'import { RotateCw, RotateCcw } from "lucide-react";',
    // Other icon packages are out of scope.
    'import { Settings2 } from "some-other-icons";',
  ],
  invalid: [
    {
      code: 'import { Settings2 } from "lucide-react";\nexport const a = <Settings2 aria-hidden />;',
      output:
        'import { Settings } from "lucide-react";\nexport const a = <Settings aria-hidden />;',
      errors: [
        {
          message:
            '"Settings2" is not the icon for settings. One icon per concept keeps actions recognizable on every screen. Import Settings from "lucide-react". See apps/web/DESIGN.md § 4 Icons.',
        },
      ],
    },
    {
      code: 'import { AlertCircle, MoreVertical, ListPlus, Trash } from "lucide-react";',
      output: 'import { CircleAlert, Ellipsis, Plus, Trash2 } from "lucide-react";',
      errors: [
        {
          messageId: "alias",
          data: { name: "AlertCircle", icon: "CircleAlert", concept: "error" },
        },
        {
          messageId: "alias",
          data: { name: "MoreVertical", icon: "Ellipsis", concept: "more actions" },
        },
        {
          messageId: "alias",
          data: { name: "ListPlus", icon: "Plus", concept: "create, add, or new" },
        },
        { messageId: "alias", data: { name: "Trash", icon: "Trash2", concept: "delete" } },
      ],
    },
    {
      // The suffixed spelling of a non-canonical icon points at the canonical one.
      code: 'import { Settings2Icon } from "lucide-react";\nconst Icon = Settings2Icon;',
      output: 'import { Settings } from "lucide-react";\nconst Icon = Settings;',
      errors: [
        {
          messageId: "alias",
          data: { name: "Settings2Icon", icon: "Settings", concept: "settings" },
        },
      ],
    },
    {
      code: 'import { ChevronLeftIcon } from "lucide-react";\nexport const a = <ChevronLeftIcon />;',
      output: 'import { ChevronLeft } from "lucide-react";\nexport const a = <ChevronLeft />;',
      errors: [
        {
          message:
            'Import "ChevronLeft" from "lucide-react", not "ChevronLeftIcon". Outside components/ui, icons use their plain names so each icon has one spelling. See apps/web/DESIGN.md § 4 Icons.',
        },
      ],
    },
    {
      code: 'import { LucideSearch } from "lucide-react";\nexport const a = <LucideSearch />;',
      output: 'import { Search } from "lucide-react";\nexport const a = <Search />;',
      errors: [
        { messageId: "suffix", data: { name: "LucideSearch", icon: "Search", concept: "" } },
      ],
    },
    {
      // Plus is already imported, so a rename would duplicate the binding: report without a fix.
      code: 'import { Plus, CirclePlus } from "lucide-react";',
      output: null,
      errors: [
        {
          messageId: "alias",
          data: { name: "CirclePlus", icon: "Plus", concept: "create, add, or new" },
        },
      ],
    },
    {
      // A renamed import keeps its local name; the fix is left to the author.
      code: 'import { Trash as TrashIcon } from "lucide-react";',
      output: null,
      errors: [{ messageId: "alias", data: { name: "Trash", icon: "Trash2", concept: "delete" } }],
    },
  ],
});

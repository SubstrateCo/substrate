import { DESIGN_DOC } from "./design-doc.ts";
import type { OxlintConfig } from "oxlint";

const WEB = "apps/web/src";
const DIALOG_INSETS =
  "Dialog parts own the insets: DialogHeader px-5 pt-5 pb-4, DialogBody px-5 pb-5 gap-4, DialogFooter px-5 py-3.";

/**
 * Design-contract lint for the renderer: `@shadcn/lint` contracts for the primitives in
 * `components/ui`, plus the `design/*` rules from this package. Paths are relative to the
 * repository root, where `oxlint.config.ts` lives.
 */
export const designConfig = {
  jsPlugins: [{ name: "design", specifier: "./tooling/design-lint/src/index.ts" }],
  settings: {
    shadcn: {
      ui: "@/components/ui",
      componentImports: [
        "^@/components/people/person-avatar$",
        "^@/components/layout/(page-sheet|page-header|board|record-section|settings-section)$",
        "^@/components/feedback/(tag|inline-notice)$",
      ],
      note: `Design contract: ${DESIGN_DOC}. Add a variant or size in ${WEB}/components/ui (shadcn CLI) only when the contract calls for one.`,
    },
  },
  rules: {
    "shadcn/no-restyle": [
      "error",
      {
        allow: ["layout"],
        contracts: [
          {
            pattern: "^Button$",
            allow: ["layout"],
            // Not size-*: "[&_svg]:size-3.5" sizes the icon inside, which is allowed.
            deny: ["h-*", "min-h-*", "max-h-*"],
            message: {
              layout:
                '"{{className}}" sets the size of <{{component}}>. Height comes from the size prop ({{sizes}}): pane and row tools are ghost icon-sm, list rows use variant="sidebar", a value that opens a picker uses variant="property". Width (w-full) and margin are fine.',
              color:
                '"{{className}}" recolors <{{component}}>. Pick a variant ({{variants}}): destructive-ghost for delete and remove triggers, destructive only for the ConfirmDialog confirm button.',
            },
          },
          {
            pattern: "^DialogContent$",
            allow: ["layout"],
            deny: ["max-w-*", "w-*", "min-w-*"],
            message: {
              layout:
                '"{{className}}" sets the dialog width by hand. Use size="default" (max-w-lg) for confirms and short forms, or size="lg" (max-w-2xl) for editors and long forms.',
              spacing: `"{{className}}" pads <DialogContent>. ${DIALOG_INSETS} Put content in DialogBody.`,
            },
          },
          {
            pattern: "^Dialog(Header|Body|Footer)$",
            allow: ["layout"],
            message: {
              spacing: `"{{className}}" changes the <{{component}}> inset. ${DIALOG_INSETS}`,
            },
          },
          {
            pattern: "^DialogTitle$",
            allow: ["layout", "wrap-*", "break-*", "truncate"],
            message:
              '"{{className}}" restyles <DialogTitle>, which owns its type (text-base semibold) and sits on the close-button line. Shorten the title instead; put detail in DialogDescription.',
          },
          {
            pattern: "^DialogDescription$",
            allow: ["layout", "wrap-*", "break-*"],
            message:
              '"{{className}}" restyles <DialogDescription>. For a clamped context line ("in Autumn launch") use variant="context".',
          },
          { pattern: "^Card(Header|Content|Footer)$", allow: ["layout", "spacing"] },
          {
            pattern: "^CardTitle$",
            allow: ["layout"],
            message:
              '"{{className}}" restyles <CardTitle>. Use its size prop ({{sizes}}). Settings groups use SettingsSection and SettingsCard from "@/components/layout/settings-section".',
          },
          {
            pattern: "^Checkbox$",
            allow: ["layout"],
            deny: ["rounded-*", "size-*", "h-*", "w-*"],
            message:
              '"{{className}}" restyles <Checkbox>, which owns its square shape and 16px size; a circle reads as a radio button. For one choice among options use RadioGroup from "@/components/ui/radio-group".',
          },
          {
            pattern: "^DropdownMenuContent$",
            allow: ["layout"],
            deny: ["w-*", "min-w-*", "max-w-*"],
            message:
              '"{{className}}" overrides the menu width. Menus size to their content (w-max, min-w-44, max-w-80) so items never wrap; position the menu with align and side instead.',
          },
          {
            pattern: "^DropdownMenuItem$",
            allow: ["layout"],
            deny: ["whitespace-*", "h-*", "min-h-*"],
            message:
              '"{{className}}" restyles <DropdownMenuItem>, which owns its single-line row. For delete, use variant="destructive" with an icon, as the last item below a DropdownMenuSeparator.',
          },
          {
            pattern: "^(Input|Textarea|SelectTrigger)$",
            allow: ["layout"],
            deny: ["h-*"],
            message: {
              layout:
                '"{{className}}" changes the height of <{{component}}>. Fields share one height so forms line up. For a compact select use SelectTrigger size="sm"; for a search field inside a picker use CommandInput from "@/components/ui/command"; add a size {{where}} only if the design calls for one.',
              default:
                '"{{className}}" restyles <{{component}}>, which owns its border, radius, and focus ring. Show an error with aria-invalid on the control and FieldError under it.',
            },
          },
          {
            pattern: "^Heading$",
            // outline-none: a heading that takes focus with tabIndex={-1} after a step changes.
            allow: ["layout", "spacing", "wrap-*", "break-*", "truncate", "outline-none"],
            message:
              '"{{className}}" restyles <Heading>. Pick the type role with variant ({{variants}}); use variant="inherit" when a container such as CardTitle sets the type.',
          },
          {
            pattern: "^Image$",
            allow: ["layout", "shape", "invert", "rotate-*"],
            message:
              '"{{className}}" restyles <Image>. Size, fit, and radius are fine; for a mark drawn for one background, pass darkSrc instead of recoloring it.',
          },
          {
            pattern: "^TextLink$",
            allow: ["layout", "truncate", "wrap-*", "break-*"],
            message:
              '"{{className}}" restyles <TextLink>. Use variant="default" for a link in text or variant="quiet" for a link that is the whole value, such as a website.',
          },
          {
            pattern: "^Pressable$",
            allow: ["layout", "spacing", "typography", "color", "shape", "motion"],
            deny: ["ring-*", "outline-*"],
            message:
              '"{{className}}" changes the focus ring of <Pressable>, which owns it so every click target shows the same one. For a target that fills a row use focus="inset".',
          },
          {
            pattern: "^PageSheetBody$",
            allow: ["layout"],
            message:
              '"{{className}}" restyles <PageSheetBody>, which owns its px-4 py-5 inset. Put section spacing on the content inside it.',
          },
          {
            pattern: "^PersonAvatar$",
            allow: ["layout"],
            deny: ["size-*", "h-*", "w-*", "min-h-*", "max-h-*", "min-w-*", "max-w-*"],
            message:
              '"{{className}}" restyles <PersonAvatar>. Use size="sm" (24px, the default) or size="xs" (20px). PersonAvatar owns its shape and neutral fill.',
          },
          {
            pattern: "^Tag$",
            allow: ["layout", "tabular-nums"],
            message:
              '"{{className}}" restyles <Tag>, which owns its border, radius, and type. For a status pass tone ("working", "success", "warning", "destructive") with an icon; inside a one-line row use size="sm". A surface that carries a status reuses toneBorder and toneFill from "@/components/feedback/tag".',
          },
          {
            pattern: "^PageHeader$",
            allow: ["layout"],
            message:
              '"{{className}}" restyles <PageHeader>, which owns its height, inset, and type. Use variant="page" for pages or variant="pane" for panes and asides; place it with margin or width only.',
          },
          {
            pattern: "^InlineNotice$",
            allow: ["layout"],
            message:
              '"{{className}}" restyles <InlineNotice>. Use tone="warning" for an alert or tone="neutral" for a status; place it with margin or width only.',
          },
          {
            // The board is the scroll container, so the page inset sits on it.
            pattern: "^Board$",
            allow: ["layout", "spacing"],
            message:
              '"{{className}}" restyles <Board>, which owns the column row and its gap-4. Columns are BoardColumn.',
          },
          {
            // A card fades while it is dragged.
            pattern: "^BoardCard$",
            allow: ["layout", "opacity-*"],
            message:
              '"{{className}}" restyles <BoardCard>, which owns one look for every board: rounded-lg border bg-surface p-3 shadow-surface. Pass selected for the selected row colour.',
          },
          {
            pattern: "^(RecordSection|PropertyList)$",
            allow: ["layout"],
            message:
              '"{{className}}" restyles <{{component}}>, which owns the section title row and gap-2 content spacing. Space sections apart on the parent (gap-6).',
          },
          {
            pattern: "^SettingsCard$",
            allow: ["layout"],
            message:
              '"{{className}}" restyles <SettingsCard>, which owns its p-5 inset, gap-4 fields, and footer. Pass footer for actions and tone="destructive" for a danger zone.',
          },
          {
            pattern: "^TableRow$",
            allow: ["layout"],
            message:
              '"{{className}}" restyles <TableRow>, which owns hover (bg-row-hover) and selected (bg-row-selected) states. Set data-state="selected" instead of a background.',
          },
          {
            pattern: "^Tabs(List|Trigger)$",
            allow: ["layout"],
            message:
              '"{{className}}" restyles Tabs. Line Tabs are for page sections; inside a popover or palette use the default pill Tabs (no variant), and for a choice among 2–4 short options use SegmentedControl from "@/components/forms/segmented-control".',
          },
        ],
      },
    ],
    "shadcn/no-raw-colors": "error",
    "shadcn/no-arbitrary-values": "error",
    "shadcn/no-inline-styles": [
      "warn",
      {
        message:
          'Inline style sets {{property}}, which bypasses the theme and this lint. Use a class or a token from apps/web/src/components/styles.css. A style is right only for a value known at run time (a measured size, a drag position, a crop transform): pass it as a CSS custom property in style, such as "--crop-scale": scale, and read it from a class, such as scale-(--crop-scale).',
      },
    ],
    "shadcn/no-unknown-classes": [
      "error",
      {
        // Hooks for component stylesheets (desktop-frame.css, typeset.css) and Sonner.
        allow: [
          "desktop-title-bar",
          "desktop-title-bar-search",
          "typeset",
          "typeset-message",
          "toaster",
        ],
      },
    ],
    "shadcn/require-static-classes": "error",
  },
  overrides: [
    {
      files: [`${WEB}/**`],
      rules: {
        "design/action-copy": "warn",
        "design/back-link": "warn",
        "design/canonical-icons": "error",
        "design/conversation-label": "warn",
        "design/destructive-label": "warn",
        "design/dialog-footer-order": "error",
        "design/dialog-structure": "warn",
        "design/elevation": "error",
        "design/entity-kind-map": "warn",
        "design/form-copy": "warn",
        "design/icon-button-name": "error",
        "design/icon-button-tooltip": "warn",
        "design/motion": "error",
        "design/no-adhoc-date-format": "error",
        "design/no-ellipsis": "error",
        "design/no-native-action-title": "error",
        "design/no-native-date-input": "error",
        "design/no-native-dialogs": "error",
        "design/no-native-element": "error",
        "design/no-opacity-tint": "warn",
        "design/no-pressed-outline": "error",
        "design/no-raw-error-message": "warn",
        "design/no-raw-validation-text": "error",
        "design/no-solid-destructive": "error",
        "design/no-tooltip-on-toggle-item": "error",
        "design/notice-placement": "warn",
        "design/notice-title": "error",
        "design/page-header": "warn",
        "design/page-width": "warn",
        "design/pane-header": "warn",
        "design/pending-button": "warn",
        "design/person-avatar": "warn",
        "design/radius-scale": "warn",
        "design/record-section-action": "warn",
        "design/selected-choice": "warn",
        "design/sentence-case": "warn",
        "design/sheet-header-tools": "warn",
        "design/type-scale": "warn",
        "design/typographic-quotes": "warn",
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "radix-ui",
                allowImportNames: ["Slot"],
                message: `Use the primitive in ${WEB}/components/ui that wraps this Radix part. Add one with the shadcn CLI if it is missing.`,
              },
              {
                name: "sonner",
                allowImportNames: ["toast"],
                message: 'Only toast comes from sonner. The Toaster is "@/components/ui/sonner".',
              },
              {
                name: "react-resizable-panels",
                allowTypeImports: true,
                message: 'Use the panels from "@/components/ui/resizable".',
              },
            ],
            patterns: [
              {
                group: ["**/ui/table", "**/ui/table.*"],
                message:
                  'Use AppTable from "@/components/table/app-table". Only its implementation imports the raw table primitives.',
              },
              {
                group: ["@radix-ui/*", "@base-ui/*", "cmdk", "react-day-picker", "vaul"],
                message: `Use the primitive in ${WEB}/components/ui that wraps this library. Add one with the shadcn CLI if it is missing.`,
              },
            ],
          },
        ],
      },
    },
    {
      files: [`${WEB}/components/table/app-table.tsx`, `${WEB}/components/ui/**`],
      rules: { "no-restricted-imports": "off" },
    },
    {
      // The helper builds the "#" name; its test checks it.
      files: [`${WEB}/lib/messaging/conversations.ts`],
      rules: { "design/conversation-label": "off" },
    },
    {
      // Vendored shadcn primitives define the treatments these rules point to.
      files: [`${WEB}/components/ui/**`],
      rules: {
        "design/action-copy": "off",
        "design/back-link": "off",
        "design/canonical-icons": "off",
        "design/dialog-footer-order": "off",
        "design/dialog-structure": "off",
        "design/elevation": "off",
        "design/icon-button-name": "off",
        "design/icon-button-tooltip": "off",
        "design/motion": "off",
        "design/no-native-element": "off",
        "design/no-raw-error-message": "off",
        "design/no-solid-destructive": "off",
        "design/page-header": "off",
        "design/page-width": "off",
        "design/pane-header": "off",
        "design/pending-button": "off",
        "design/selected-choice": "off",
        "design/no-opacity-tint": "off",
        "design/radius-scale": "off",
        "design/sentence-case": "off",
        "design/type-scale": "off",
        "design/typographic-quotes": "off",
        "shadcn/no-inline-styles": "off",
      },
    },
    {
      // Tests build dates and read schema messages to check them.
      files: [`${WEB}/**/*.test.ts`, `${WEB}/**/*.test.tsx`],
      rules: {
        "design/no-adhoc-date-format": "off",
        "design/no-raw-validation-text": "off",
        "design/typographic-quotes": "off",
      },
    },
    {
      files: [`${WEB}/lib/format/**`],
      rules: { "design/no-adhoc-date-format": "off" },
    },
    {
      files: [`${WEB}/lib/forms/**`],
      rules: { "design/no-raw-validation-text": "off" },
    },
    {
      // PersonAvatar is the one place a small head is built from Avatar.
      files: [`${WEB}/components/people/person-avatar.tsx`],
      rules: { "design/person-avatar": "off" },
    },
    {
      files: [`${WEB}/components/feedback/confirm-dialog.tsx`],
      rules: { "design/no-solid-destructive": "off" },
    },
    {
      // The workspace frame rounds the content panel into the rail.
      files: [`${WEB}/components/workspace/workspace-shell.tsx`],
      rules: { "design/radius-scale": "off" },
    },
    {
      // PageHeader and the guest frame are the shared page titles.
      files: [`${WEB}/components/layout/**`, `${WEB}/components/auth/auth-frame.tsx`],
      rules: { "design/page-header": "off" },
    },
    {
      // The shared layouts define the page widths, the pane header, and BackLink.
      files: [`${WEB}/components/layout/**`, `${WEB}/components/auth/auth-frame.tsx`],
      rules: {
        "design/back-link": "off",
        "design/page-width": "off",
        "design/pane-header": "off",
      },
    },
    {
      files: [`${WEB}/components/auth/**`, `${WEB}/components/onboarding/**`],
      rules: { "design/guest-copy": "warn" },
    },
    {
      // The one record-kind map.
      files: [
        `${WEB}/components/context/entity-kinds.ts`,
        `${WEB}/components/context/entity-kinds.tsx`,
      ],
      rules: { "design/entity-kind-map": "off" },
    },
    {
      // The shared notices and loading views own their own placement and loading label.
      files: [`${WEB}/components/feedback/**`],
      rules: { "design/notice-placement": "off", "design/pending-button": "off" },
    },
  ],
} satisfies Pick<OxlintConfig, "jsPlugins" | "settings" | "rules" | "overrides">;

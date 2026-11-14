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
        // Hooks for component stylesheets (desktop-frame.css, message-markdown.css) and Sonner.
        allow: ["desktop-title-bar", "desktop-title-bar-search", "message-markdown", "toaster"],
      },
    ],
    "shadcn/require-static-classes": "error",
  },
  overrides: [
    {
      files: [`${WEB}/**`],
      rules: {
        "design/canonical-icons": "error",
        "design/conversation-label": "warn",
        "design/destructive-label": "warn",
        "design/dialog-footer-order": "error",
        "design/dialog-structure": "warn",
        "design/icon-button-name": "error",
        "design/icon-button-tooltip": "warn",
        "design/motion": "error",
        "design/no-adhoc-date-format": "error",
        "design/no-native-dialogs": "error",
        "design/no-pressed-outline": "error",
        "design/no-raw-error-message": "warn",
        "design/no-raw-validation-text": "error",
        "design/no-solid-destructive": "error",
        "design/no-tooltip-on-toggle-item": "error",
        "design/page-header": "warn",
        "design/person-avatar": "warn",
        "design/sentence-case": "warn",
        "design/typographic-quotes": "warn",
      },
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
        "design/canonical-icons": "off",
        "design/dialog-footer-order": "off",
        "design/dialog-structure": "off",
        "design/icon-button-name": "off",
        "design/icon-button-tooltip": "off",
        "design/motion": "off",
        "design/no-raw-error-message": "off",
        "design/no-solid-destructive": "off",
        "design/page-header": "off",
        "design/sentence-case": "off",
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
      // PageHeader and the guest frame are the shared page titles.
      files: [`${WEB}/components/layout/**`, `${WEB}/components/auth/auth-frame.tsx`],
      rules: { "design/page-header": "off" },
    },
  ],
} satisfies Pick<OxlintConfig, "jsPlugins" | "settings" | "rules" | "overrides">;

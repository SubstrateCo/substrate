import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-97 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive focus-visible:aria-invalid:ring-destructive/20 motion-reduce:active:scale-100 dark:aria-invalid:border-destructive dark:focus-visible:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Solid fills reach the border box, so a primary button is as tall as an outline one.
        default: "bg-primary bg-clip-border text-primary-foreground hover:bg-primary/90",
        outline:
          "border-control-border bg-card hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground dark:hover:bg-foreground/15 dark:aria-expanded:bg-foreground/15",
        avatar:
          // oxlint-disable-next-line design/no-decorative-class -- Initials.
          "rounded-full bg-accent text-xs font-semibold text-accent-foreground hover:bg-accent/80",
        // Solid red. Only for the confirm button of a destructive ConfirmDialog.
        destructive:
          "bg-destructive-solid bg-clip-border text-destructive-foreground hover:bg-destructive-solid/90 focus-visible:border-destructive focus-visible:ring-destructive/30 dark:focus-visible:ring-destructive/40",
        // Quiet red. For row and section triggers that open a destructive confirm.
        // Icon-only buttons stay muted until hovered or focused.
        "destructive-ghost":
          "text-destructive hover:bg-destructive/10 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 aria-expanded:bg-destructive/10 data-[size^=icon]:text-muted-foreground data-[size^=icon]:hover:text-destructive data-[size^=icon]:focus-visible:text-destructive data-[size^=icon]:aria-expanded:text-destructive dark:hover:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
        accent:
          "bg-accent text-accent-foreground hover:bg-row-selected hover:text-row-selected-foreground",
        rail: "text-rail-foreground/70 hover:bg-rail-foreground/10 hover:text-rail-foreground aria-[current=page]:border-accent-foreground/15 aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground",
        workspace:
          "border-rail-foreground/20 bg-rail-foreground/10 text-rail-foreground hover:bg-rail-foreground/20",
        // List rows: they do not scale on press. Hover and selected use separate tokens.
        sidebar:
          "font-normal text-muted-foreground hover:bg-row-hover hover:text-foreground active:scale-100 aria-[current=page]:bg-row-selected aria-[current=page]:font-medium aria-[current=page]:text-row-selected-foreground",
        // A property value that opens a picker, such as a task's assignee, or a listbox option
        // row, such as a reference picker result. Reads as text at rest. An option's keyboard
        // cursor is aria-selected; it is not a pressed or chosen state.
        property:
          "justify-start font-normal hover:bg-row-hover focus-visible:bg-row-hover active:scale-100 aria-expanded:bg-row-hover aria-selected:bg-row-highlight aria-selected:hover:bg-row-highlight",
        // A popover or combobox trigger that is a form field (task Assignee, Time zone). It has
        // the field boundary and height of Input and SelectTrigger. Inline values in a row or
        // inspector stay `property`.
        field:
          "w-full justify-between rounded-lg border-input bg-transparent font-normal hover:bg-row-hover active:scale-100 aria-expanded:border-ring aria-expanded:ring-3 aria-expanded:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50",
        // Expand/collapse headers: no fill when hovered, pressed, or expanded.
        disclosure: "text-muted-foreground hover:text-foreground active:scale-100",
        reaction:
          "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:border-primary/30 aria-pressed:bg-accent aria-pressed:text-accent-foreground",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-md px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-md px-2.5 text-sm in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        "sm-wrap":
          "h-auto min-h-7 gap-1 rounded-md px-2.5 py-1 text-sm whitespace-normal in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-md in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-md in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
        selection: "h-auto min-h-12 px-3 py-2",
        // xs spacing for a removable chip whose label wraps, so it grows with its text.
        chip: "h-auto min-h-6 gap-1 rounded-md px-2 py-1 text-left text-xs whitespace-normal [&_svg:not([class*='size-'])]:size-3",
      },
    },
    compoundVariants: [
      { variant: "sidebar", size: "default", className: "gap-2 px-2" },
      // Option rows grow with a wrapped title and description.
      { variant: "property", size: "default", className: "h-auto py-1.5" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

import { cva } from "class-variance-authority";

export const rowStateVariants = cva("", {
  variants: {
    selected: {
      true: "bg-row-selected text-row-selected-foreground hover:bg-row-selected",
      false: "",
    },
    hover: { true: "", false: "" },
  },
  compoundVariants: [{ selected: false, hover: true, class: "hover:bg-row-hover" }],
  defaultVariants: { selected: false, hover: true },
});

export const rowTitleVariants = cva("", {
  variants: {
    state: {
      // oxlint-disable-next-line design/no-decorative-class -- Unread rows.
      unread: "font-semibold text-foreground",
      read: "",
      closed: "",
      canceled: "text-muted-foreground line-through",
    },
    selected: { true: "font-medium", false: "" },
  },
  compoundVariants: [{ state: "closed", selected: false, class: "text-muted-foreground" }],
  defaultVariants: { state: "read", selected: false },
});

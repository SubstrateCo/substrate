import { cva } from "class-variance-authority";

/** A list row's selection: the selected fill and text, or the hover fill for other rows. */
export const rowStateVariants = cva("", {
  variants: {
    selected: {
      true: "bg-row-selected text-row-selected-foreground hover:bg-row-selected",
      false: "",
    },
    /** Off for a row that does not respond to hover, such as a dragged copy. */
    hover: { true: "", false: "" },
  },
  compoundVariants: [{ selected: false, hover: true, class: "hover:bg-row-hover" }],
  defaultVariants: { selected: false, hover: true },
});

/** A row title's text: unread stands out, closed work (done, ended) is muted unless selected. */
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

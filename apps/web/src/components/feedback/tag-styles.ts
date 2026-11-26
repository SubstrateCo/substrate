/** The border colour of a status tone. Surfaces that carry a tone (a message card) reuse it. */
export const toneBorder = {
  warning: "border-warning/50",
  destructive: "border-destructive/40",
} as const;

/** The fill of a status tone, for a tinted header, banner row, or count pill. */
export const toneFill = {
  warning: "bg-warning/10",
  destructive: "bg-destructive/5",
} as const;

/** The text colour of a status label outside a `Tag`. Live work is the accent. */
export const toneText = {
  default: "",
  idle: "",
  muted: "",
  // Finished work shows its colour on its icon only.
  done: "",
  working: "text-primary",
  success: "text-success",
  attention: "text-warning-text",
  warning: "text-warning-text",
  failed: "text-destructive",
  destructive: "text-destructive",
} as const;

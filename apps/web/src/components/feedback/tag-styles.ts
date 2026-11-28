export const toneBorder = {
  warning: "border-warning/50",
  destructive: "border-destructive/40",
} as const;

export const toneFill = {
  warning: "bg-warning/10",
  destructive: "bg-destructive/5",
} as const;

export const toneText = {
  default: "",
  idle: "",
  muted: "",
  done: "",
  working: "text-primary",
  success: "text-success",
  attention: "text-warning-text",
  warning: "text-warning-text",
  failed: "text-destructive",
  destructive: "text-destructive",
} as const;

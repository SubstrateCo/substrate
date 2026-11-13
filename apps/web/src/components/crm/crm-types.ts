export type CrmSection = "accounts" | "deals" | "settings";
export type CrmKind = Exclude<CrmSection, "settings"> | "contacts";

export const sectionLabels: Record<CrmSection | "contacts", string> = {
  accounts: "Accounts",
  contacts: "Contacts",
  deals: "Deals",
  settings: "Settings",
};

export const singularLabels = { accounts: "account", contacts: "contact", deals: "deal" } as const;
export const outcomeLabels = { open: "Open", won: "Won", lost: "Lost" } as const;
export function outcomeLabel(outcome: string) {
  if (outcome === "open" || outcome === "won" || outcome === "lost") return outcomeLabels[outcome];
  return "Unknown outcome";
}
export function accessLabel(level: string) {
  if (level === "owner") return "Owner";
  if (level === "edit") return "Can edit";
  return "Can view";
}

export function dealAmount(amount: string | null, currency: string | null) {
  if (amount === null) return "Amount not set";
  return `${currency ?? ""} ${amount}`.trim();
}

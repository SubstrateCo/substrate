export type CrmSection = "accounts" | "deals" | "settings";
export type CrmKind = Exclude<CrmSection, "settings"> | "contacts";

export const sectionLabels: Record<CrmSection | "contacts", string> = {
  accounts: "Accounts",
  contacts: "Contacts",
  deals: "Deals",
  settings: "Settings",
};

export const singularLabels = { accounts: "account", contacts: "contact", deals: "deal" } as const;
const outcomeLabels = { open: "Open", won: "Won", lost: "Lost" } as const;
export const outcomeOptions = (["open", "won", "lost"] as const).map((value) => ({
  value,
  label: outcomeLabels[value],
}));
// oxlint-disable-next-line deslop/prefer-literal-union -- Persisted outcomes are strings; retain the unknown-value fallback.
export function outcomeLabel(outcome: string) {
  if (outcome === "open" || outcome === "won" || outcome === "lost") return outcomeLabels[outcome];
  return "Unknown outcome";
}
// oxlint-disable-next-line deslop/prefer-literal-union -- Unknown access levels must fall back to the read-only label.
export function accessLabel(level: string) {
  if (level === "owner") return "Owner";
  if (level === "edit") return "Can edit";
  return "Can view";
}

export function dealAmount(amount: string | null, currency: string | null) {
  if (amount === null) return "Amount not set";
  return new Intl.NumberFormat(
    "en-US",
    currency ? { style: "currency", currency } : { maximumFractionDigits: 4 },
  ).format(Number(amount));
}

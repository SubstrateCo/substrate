import type { CrmSection } from "./crm-navigation";

export function crmToolbarActions({
  section,
  crm,
  admin,
}: {
  section: CrmSection;
  crm: boolean;
  admin: boolean;
}) {
  return {
    export: admin && (section === "contacts" || section === "accounts" || section === "deals"),
    editStages: admin && section === "pipeline",
    settings: crm && section !== "pipeline",
  };
}

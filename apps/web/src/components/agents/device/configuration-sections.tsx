import { CatalogRowLoading } from "../catalog/catalog-row";
import type { AgentSection } from "../editors/agent-form";
import { configurationSections } from "./configuration-section-copy";
import { SettingsList } from "@/components/layout/settings-section";

/** Placeholder rows for the owner's skills or servers while they load. */
export function ConfigurationListLoading({ section }: { section: AgentSection }) {
  return (
    <SettingsList title={configurationSections[section].listTitle}>
      <CatalogRowLoading picture={section === "mcps"} />
      <CatalogRowLoading picture={section === "mcps"} />
    </SettingsList>
  );
}

import { CatalogRowLoading } from "../catalog/catalog-row";
import type { AgentSection } from "../editors/agent-form";
import { configurationSections } from "./configuration-section-copy";
import { RecordSection, recordRows } from "@/components/layout/record-section";

/** Placeholder rows for the owner's skills or servers while they load. */
export function ConfigurationListLoading({ section }: { section: AgentSection }) {
  return (
    <RecordSection title={configurationSections[section].listTitle}>
      <ul aria-label={configurationSections[section].listTitle} className={recordRows}>
        <CatalogRowLoading picture={section === "mcps"} />
        <CatalogRowLoading picture={section === "mcps"} />
      </ul>
    </RecordSection>
  );
}

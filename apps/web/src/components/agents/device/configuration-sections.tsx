import { CatalogRowLoading } from "../catalog/catalog-row";
import type { AgentSection } from "../editors/agent-form";
import { ConfigurationList } from "./configuration-page";
import { configurationSections } from "./configuration-section-copy";

/** Placeholder rows for the owner's skills or servers while they load. */
export function ConfigurationListLoading({ section }: { section: AgentSection }) {
  const copy = configurationSections[section];
  return (
    <ConfigurationList title={copy.listTitle} description={copy.description}>
      <CatalogRowLoading picture={section === "mcps"} />
      <CatalogRowLoading picture={section === "mcps"} />
    </ConfigurationList>
  );
}

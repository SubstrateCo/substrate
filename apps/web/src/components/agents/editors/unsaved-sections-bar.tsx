import {
  agentSectionLabels,
  type AgentSettingsSection,
} from "@/components/agent-work/app/agent-sections";
import { Button } from "@/components/ui/button";

/**
 * Tells the owner where unsaved changes are while they look at another section. Each name goes
 * to the section whose card saves or discards it, so there is one place to decide.
 */
export function UnsavedSectionsBar({
  sections,
  onSectionChange,
}: {
  /** The sections with unsaved changes, other than the one on screen. */
  sections: readonly AgentSettingsSection[];
  onSectionChange: (section: AgentSettingsSection) => void;
}) {
  if (!sections.length) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-xl border bg-card px-4 py-2.5 text-sm shadow-raised"
    >
      <p className="text-muted-foreground">Unsaved changes in</p>
      {sections.map((section, index) => (
        <span key={section} className="flex items-center gap-1.5">
          <Button type="button" variant="link" onClick={() => onSectionChange(section)}>
            {agentSectionLabels[section]}
          </Button>
          {index < sections.length - 1 && (
            <span aria-hidden="true" className="text-muted-foreground">
              ·
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

import {
  agentSectionLabels,
  type AgentSettingsSection,
} from "@/components/agent-work/app/agent-sections";
import { Button } from "@/components/ui/button";

/**
 * Tells the owner where unsaved changes are while they look at another section. Each name goes
 * to the section whose card saves or discards it, so the owner can still decide one by one, or
 * drop every draft at once.
 */
export function UnsavedSectionsBar({
  sections,
  onSectionChange,
  onDiscardAll,
}: {
  /** The sections with unsaved changes, other than the one on screen. */
  sections: readonly AgentSettingsSection[];
  onSectionChange: (section: AgentSettingsSection) => void;
  onDiscardAll: () => void;
}) {
  if (!sections.length) return null;
  return (
    <div
      role="region"
      aria-label="Unsaved changes"
      className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card py-2 pr-2.5 pl-4 text-sm shadow-raised"
    >
      <p className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-muted-foreground">
        Unsaved changes in
        {sections.map((section, index) => (
          <span key={section} className="flex items-center">
            <Button type="button" variant="link" onClick={() => onSectionChange(section)}>
              {agentSectionLabels[section]}
            </Button>
            {index < sections.length - 1 && <span aria-hidden="true">,</span>}
          </span>
        ))}
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onDiscardAll}>
        Discard all
      </Button>
    </div>
  );
}

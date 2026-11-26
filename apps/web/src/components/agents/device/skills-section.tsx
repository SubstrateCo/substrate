import { type HarnessSkill } from "@substrate/contracts/harness";

import { type ReactNode } from "react";

import { CatalogRow } from "../catalog/catalog-row";
import { openingName } from "../editors/skill-name";
import { configurationSections } from "./configuration-sections";
import { StartupSkills } from "./startup-configuration";
import { SettingsList, SettingsSection } from "@/components/layout/settings-section";
import { Button } from "@/components/ui/button";
import { Plus, RotateCcw } from "lucide-react";

function SkillList({
  skills,
  removing,
  onEdit,
  onDelete,
}: {
  skills: readonly HarnessSkill[];
  removing: boolean;
  onEdit: (id: string) => void;
  onDelete: (skill: { id: string; name: string }) => void;
}) {
  return (
    <SettingsList title={configurationSections.skills.listTitle}>
      {skills.length ? (
        skills.map((item) => {
          // The list, the editor and the delete prompt all name the skill by its file name.
          const name = openingName(item);
          return (
            <CatalogRow
              key={item.id}
              name={name}
              mono
              detail={item.description}
              disabled={removing}
              onEdit={() => onEdit(item.id)}
              onDelete={() => onDelete({ id: item.id, name })}
            />
          );
        })
      ) : (
        <li className="px-4 py-3 text-sm text-muted-foreground">
          No skills of your own yet. Create one to teach this agent a repeatable task.
        </li>
      )}
    </SettingsList>
  );
}

export function SkillsSection({
  skills,
  managedSkills,
  scanned,
  available,
  fetching,
  refresh,
  status,
  resetting,
  removing,
  onReset,
  onCreate,
  onEdit,
  onDelete,
}: {
  skills: readonly HarnessSkill[];
  managedSkills: HarnessSkill[];
  scanned: boolean;
  available: boolean;
  fetching: boolean;
  refresh: ReactNode;
  status: ReactNode;
  /** A reset of the defaults is running. */
  resetting: boolean;
  /** A delete is running. */
  removing: boolean;
  onReset: () => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onDelete: (skill: { id: string; name: string }) => void;
}) {
  return (
    <SettingsSection
      title={configurationSections.skills.title}
      description={configurationSections.skills.description}
      actions={
        <>
          {refresh}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!available || resetting}
            onClick={onReset}
          >
            <RotateCcw />
            Reset defaults
          </Button>
          <Button type="button" size="sm" disabled={!available || fetching} onClick={onCreate}>
            <Plus />
            New skill
          </Button>
        </>
      }
    >
      {status}
      {managedSkills.length > 0 && <StartupSkills skills={managedSkills} scanned={scanned} />}
      {scanned && (
        <SkillList skills={skills} removing={removing} onEdit={onEdit} onDelete={onDelete} />
      )}
    </SettingsSection>
  );
}
